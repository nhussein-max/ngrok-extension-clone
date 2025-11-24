#!/usr/bin/env python3
"""
L1 Annotation Validation Server

A local Flask server that validates code patches by building Docker/Podman
containers and running test scripts against applied patches.
"""

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow requests from browser extension

# Detect container engine
CONTAINER_ENGINE = "docker" if shutil.which("docker") else "podman"


@dataclass
class PatchResult:
    """Result of validating a single patch."""
    patch_key: str
    applied: bool
    tests_passed: Optional[bool] = None
    error: Optional[str] = None
    test_output: Optional[str] = None
    local_path: Optional[str] = None  # Path to cached patched files


@dataclass
class ValidationResult:
    """Result of validating an entire task."""
    success: bool
    container_built: bool
    patch_results: list
    error: Optional[str] = None


def extract_value(field):
    """Extract value from _sf_rich format or return as-is."""
    if isinstance(field, dict) and "_sf_rich" in field:
        return field.get("value", "")
    return field


def image_exists(image_name: str) -> bool:
    """Check if a Docker image already exists."""
    check_cmd = f"{CONTAINER_ENGINE} image inspect {image_name}"
    result = subprocess.run(check_cmd, shell=True, capture_output=True)
    return result.returncode == 0


def build_container(image_name: str, dockerfile_txt: str, force: bool = False) -> tuple[bool, str]:
    """Build a container from Dockerfile text."""
    # Skip build if image already exists (unless forced)
    if not force and image_exists(image_name):
        return True, ""

    with tempfile.TemporaryDirectory() as tmpdir:
        dockerfile_path = os.path.join(tmpdir, "Dockerfile")

        with open(dockerfile_path, "w") as f:
            f.write(dockerfile_txt)

        build_cmd = f"{CONTAINER_ENGINE} build -t {image_name} {tmpdir}"
        result = subprocess.run(
            build_cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout for builds
        )

        if result.returncode != 0:
            return False, result.stderr
        return True, ""


def start_container(image_name: str, container_name: str) -> tuple[bool, str]:
    """Start a container in the background."""
    # Remove any existing container with the same name first
    subprocess.run(f"{CONTAINER_ENGINE} rm -f {container_name}", shell=True, capture_output=True)

    run_cmd = f"{CONTAINER_ENGINE} run -d --name {container_name} {image_name} tail -f /dev/null"
    result = subprocess.run(run_cmd, shell=True, capture_output=True, text=True)

    if result.returncode != 0:
        return False, result.stderr
    return True, ""


def stop_and_remove_container(container_name: str):
    """Stop and remove a container."""
    subprocess.run(f"{CONTAINER_ENGINE} stop {container_name}", shell=True, capture_output=True)
    subprocess.run(f"{CONTAINER_ENGINE} rm {container_name}", shell=True, capture_output=True)


def apply_patch_in_container(container_id: str, patch_content: str, target_dir: str = "/testbed") -> tuple[bool, str]:
    """Apply a patch inside the container. Returns (success, error_message)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as f:
        f.write(patch_content)
        patch_file = f.name

    try:
        # Copy patch to container
        copy_cmd = f"{CONTAINER_ENGINE} cp {patch_file} {container_id}:/tmp/patch.patch"
        result = subprocess.run(copy_cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            return False, f"Failed to copy patch: {result.stderr}"

        # Apply patch
        apply_cmd = f"{CONTAINER_ENGINE} exec {container_id} bash -c 'cd {target_dir} && git apply /tmp/patch.patch'"
        apply_result = subprocess.run(apply_cmd, shell=True, capture_output=True, text=True)

        if apply_result.returncode != 0:
            error_output = apply_result.stderr or apply_result.stdout
            return False, error_output.strip()
        return True, ""
    finally:
        os.unlink(patch_file)


def revert_patch_in_container(container_id: str, patch_content: str, target_dir: str = "/testbed") -> bool:
    """Revert a patch inside the container."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as f:
        f.write(patch_content)
        patch_file = f.name

    try:
        copy_cmd = f"{CONTAINER_ENGINE} cp {patch_file} {container_id}:/tmp/patch.patch"
        subprocess.run(copy_cmd, shell=True, capture_output=True, text=True)

        revert_cmd = f"{CONTAINER_ENGINE} exec {container_id} bash -c 'cd {target_dir} && git apply -R /tmp/patch.patch'"
        result = subprocess.run(revert_cmd, shell=True, capture_output=True, text=True)

        return result.returncode == 0
    finally:
        os.unlink(patch_file)


def run_tests_in_container(container_id: str, test_script: str, target_dir: str = "/testbed") -> tuple[bool, str]:
    """Run test script inside the container."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False) as f:
        f.write(test_script)
        script_file = f.name

    try:
        # Copy test script to container
        copy_cmd = f"{CONTAINER_ENGINE} cp {script_file} {container_id}:/tmp/test.sh"
        subprocess.run(copy_cmd, shell=True, capture_output=True, text=True)

        # Make executable and run
        chmod_cmd = f"{CONTAINER_ENGINE} exec {container_id} chmod +x /tmp/test.sh"
        subprocess.run(chmod_cmd, shell=True, capture_output=True, text=True)

        run_cmd = f"{CONTAINER_ENGINE} exec {container_id} bash -c 'cd {target_dir} && /tmp/test.sh'"
        result = subprocess.run(
            run_cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout for tests
        )

        output = result.stdout + "\n" + result.stderr
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Test execution timed out"
    finally:
        os.unlink(script_file)


def validate_task(annotation_data: dict, run_tests: bool = True) -> ValidationResult:
    """Validate all patches in a task against the test script.

    Args:
        annotation_data: The annotation data containing dockerfile, patches, etc.
        run_tests: If True, run test scripts. If False, only check if patches apply.
    """

    # Extract fields from annotation data
    dockerfile_raw = annotation_data.get("dockerfile", "")
    dockerfile = extract_value(dockerfile_raw)

    test_scripts_raw = annotation_data.get("test_scripts", "")
    test_scripts = extract_value(test_scripts_raw)

    prompt_uid_raw = annotation_data.get("prompt_uid", "unknown")
    prompt_uid = extract_value(prompt_uid_raw)

    if not dockerfile:
        return ValidationResult(
            success=False,
            container_built=False,
            patch_results=[],
            error="No dockerfile provided"
        )

    if run_tests and not test_scripts:
        return ValidationResult(
            success=False,
            container_built=False,
            patch_results=[],
            error="No test scripts provided"
        )

    image_name = f"l1-validate-{prompt_uid}"
    container_name = f"{image_name}-container"

    # Build container
    try:
        built, error = build_container(image_name, dockerfile)
        if not built:
            return ValidationResult(
                success=False,
                container_built=False,
                patch_results=[],
                error=f"Failed to build container: {error}"
            )
    except subprocess.TimeoutExpired:
        return ValidationResult(
            success=False,
            container_built=False,
            patch_results=[],
            error="Container build timed out"
        )

    # Start container
    started, error = start_container(image_name, container_name)
    if not started:
        return ValidationResult(
            success=False,
            container_built=True,
            patch_results=[],
            error=f"Failed to start container: {error}"
        )

    try:
        # Find all patch fields
        patch_keys = [
            key for key in annotation_data.keys()
            if key.endswith("_diff") or key.endswith("_patch")
        ]

        patch_results = []

        for patch_key in patch_keys:
            patch_content = extract_value(annotation_data[patch_key])

            if not patch_content or patch_content == "NA":
                continue

            # Apply patch
            applied, apply_error = apply_patch_in_container(container_name, patch_content)

            if not applied:
                patch_results.append(PatchResult(
                    patch_key=patch_key,
                    applied=False,
                    tests_passed=None,
                    error=f"Failed to apply patch: {apply_error}" if apply_error else "Failed to apply patch",
                    test_output=apply_error  # Store error in test_output so it's clickable
                ))
                continue

            # Save patched files to local cache
            patch_name = patch_key.replace('_diff', '').replace('_patch', '')
            local_path = os.path.expanduser(f"~/L1-patches/{prompt_uid}/{patch_name}")
            os.makedirs(local_path, exist_ok=True)
            copy_cmd = f"{CONTAINER_ENGINE} cp {container_name}:/testbed/. {local_path}"
            subprocess.run(copy_cmd, shell=True, capture_output=True)

            # Run tests if requested
            if run_tests:
                tests_passed, test_output = run_tests_in_container(container_name, test_scripts)

                patch_results.append(PatchResult(
                    patch_key=patch_key,
                    applied=True,
                    tests_passed=tests_passed,
                    error=None if tests_passed else "Tests failed",
                    test_output=test_output,
                    local_path=local_path
                ))
            else:
                # Just check if patch applies
                patch_results.append(PatchResult(
                    patch_key=patch_key,
                    applied=True,
                    tests_passed=None,  # Not tested
                    error=None,
                    test_output=None,
                    local_path=local_path
                ))

            # Revert patch for next iteration
            revert_patch_in_container(container_name, patch_content)

        # Determine overall success
        if run_tests:
            all_passed = all(
                r.applied and r.tests_passed
                for r in patch_results
            ) if patch_results else False
        else:
            # For check-only mode, success = all patches applied
            all_passed = all(r.applied for r in patch_results) if patch_results else False

        return ValidationResult(
            success=all_passed,
            container_built=True,
            patch_results=[{
                "patch_key": r.patch_key,
                "applied": r.applied,
                "tests_passed": r.tests_passed,
                "error": r.error,
                "test_output": r.test_output,
                "local_path": r.local_path
            } for r in patch_results],
            error=None
        )

    finally:
        # Cleanup
        stop_and_remove_container(container_name)


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "container_engine": CONTAINER_ENGINE,
        "engine_available": shutil.which(CONTAINER_ENGINE) is not None
    })


@app.route("/validate", methods=["POST"])
def validate():
    """Validate patches in an annotation task."""
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "success": False,
                "error": "No data provided"
            }), 400

        # Check if we should only check patch application (skip tests)
        check_only = request.args.get('check_only', 'false').lower() == 'true'

        result = validate_task(data, run_tests=not check_only)

        return jsonify({
            "success": result.success,
            "container_built": result.container_built,
            "patch_results": result.patch_results,
            "error": result.error
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/open-patch", methods=["POST"])
def open_patch():
    """Open a cached patch folder in VS Code (instant - no container needed)."""
    try:
        data = request.get_json()
        local_path = data.get("local_path", "")

        if not local_path:
            return jsonify({
                "success": False,
                "error": "Missing local_path"
            }), 400

        # Expand ~ in path
        local_path = os.path.expanduser(local_path)

        if not os.path.exists(local_path):
            return jsonify({
                "success": False,
                "error": f"Path not found: {local_path}"
            }), 404

        # Open VS Code instantly
        subprocess.run(f"code {local_path}", shell=True)

        return jsonify({
            "success": True,
            "path": local_path
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/validate-single", methods=["POST"])
def validate_single():
    """Validate a single patch against a task."""
    try:
        data = request.get_json()

        dockerfile = extract_value(data.get("dockerfile", ""))
        test_scripts = extract_value(data.get("test_scripts", ""))
        patch = extract_value(data.get("patch", ""))
        prompt_uid = extract_value(data.get("prompt_uid", "single"))

        if not all([dockerfile, test_scripts, patch]):
            return jsonify({
                "success": False,
                "error": "Missing dockerfile, test_scripts, or patch"
            }), 400

        image_name = f"l1-validate-{prompt_uid}"
        container_name = f"{image_name}-container"

        # Build container
        built, error = build_container(image_name, dockerfile)
        if not built:
            return jsonify({
                "success": False,
                "applied": False,
                "tests_passed": None,
                "error": f"Failed to build container: {error}"
            })

        # Start container
        started, error = start_container(image_name, container_name)
        if not started:
            return jsonify({
                "success": False,
                "applied": False,
                "tests_passed": None,
                "error": f"Failed to start container: {error}"
            })

        try:
            # Apply patch
            applied = apply_patch_in_container(container_name, patch)
            if not applied:
                return jsonify({
                    "success": False,
                    "applied": False,
                    "tests_passed": None,
                    "error": "Failed to apply patch"
                })

            # Run tests
            tests_passed, test_output = run_tests_in_container(container_name, test_scripts)

            return jsonify({
                "success": tests_passed,
                "applied": True,
                "tests_passed": tests_passed,
                "error": None if tests_passed else f"Tests failed: {test_output[:500]}"
            })

        finally:
            stop_and_remove_container(container_name)

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


if __name__ == "__main__":
    print(f"L1 Validation Server starting...")
    print(f"Container engine: {CONTAINER_ENGINE}")
    print(f"Engine available: {shutil.which(CONTAINER_ENGINE) is not None}")
    app.run(host="127.0.0.1", port=5050, debug=True)
