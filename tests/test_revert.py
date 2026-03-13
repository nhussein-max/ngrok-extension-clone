#!/usr/bin/env python3
"""
End-to-end test harness that:

1. Starts the L1 Validation Server (`server.py`) in the background.
2. Builds an annotation-style payload from `tests/test_resources`:
   - Dockerfile
   - One or more `*_patch.diff` files
   - A simple test script (or your own, if desired)
3. Calls the server's `/validate` endpoint (like the extension does),
   which:
     - builds the container,
     - applies each *_diff/*_patch field in turn,
     - reverts each patch before moving to the next.
4. Prints a summary of the result.
5. Shuts the server down when done.
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Dict


def read_text(path: str) -> str:
    path = os.path.expanduser(path)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def build_annotation_payload(resources_dir: str) -> Dict:
    """
    Build an annotation-style payload from files in tests/test_resources.

    Expected files (all optional except Dockerfile):
      - Dockerfile
      - gpt_patch.diff
      - gemini_patch.diff
      - grok_patch.diff
      - gold_patch.diff
      - test_script.sh      (optional; if present will be used as test_scripts)
    """
    dockerfile_path = os.path.join(resources_dir, "Dockerfile")
    if not os.path.exists(dockerfile_path):
        raise FileNotFoundError(f"Dockerfile not found at {dockerfile_path}")

    dockerfile_txt = read_text(dockerfile_path)

    patch_files = {
        "gpt_patch_diff": "gpt_patch.diff",
        "gemini_patch_diff": "gemini_patch.diff",
        "grok_patch_diff": "grok_patch.diff",
        "gold_patch_diff": "gold_patch.diff",
    }

    annotation: Dict[str, str] = {
        "dockerfile": dockerfile_txt,
        "prompt_uid": "test-revert",
    }

    # Use a real test script if provided, otherwise a no-op script.
    test_script_path = os.path.join(resources_dir, "test_script.sh")
    if os.path.exists(test_script_path):
        annotation["test_scripts"] = read_text(test_script_path)
    else:
        annotation["test_scripts"] = "#!/bin/bash\nexit 0\n"

    # Add any patch files that exist as *_diff fields.
    for key, filename in patch_files.items():
        patch_path = os.path.join(resources_dir, filename)
        if os.path.exists(patch_path):
            annotation[key] = read_text(patch_path)

    return annotation


def call_validate(server_url: str, annotation: Dict, check_only: bool = True) -> Dict:
    """Call the /validate endpoint on the running server."""
    url = f"{server_url.rstrip('/')}/validate"
    if check_only:
        url += "?check_only=true"

    data = json.dumps(annotation).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=600) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body)


def wait_for_health(server_url: str, timeout: float = 60.0) -> None:
    """
    Poll the /health endpoint until the server is ready or timeout expires.
    Raises RuntimeError if the server does not become healthy in time.
    """
    health_url = f"{server_url.rstrip('/')}/health"
    deadline = time.time() + timeout

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=5) as resp:
                if resp.status == 200:
                    return
        except urllib.error.URLError:
            time.sleep(0.5)

    raise RuntimeError(f"Server at {health_url} did not become healthy within {timeout} seconds")


def start_server_in_background(repo_root: str) -> subprocess.Popen:
    """
    Start server.py in the background and return the Popen handle.
    Uses the same Python interpreter as this script (sys.executable).
    """
    server_path = os.path.join(repo_root, "server.py")
    if not os.path.exists(server_path):
        raise FileNotFoundError(f"server.py not found at {server_path}")

    # Start server in background; output will go to the same stdout/stderr.
    proc = subprocess.Popen(
        [sys.executable, "server.py"],
        cwd=repo_root,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    return proc


def summarize_result(result: Dict) -> None:
    """Pretty-print key fields from the /validate response."""
    print("=== /validate response ===")
    print(f"success:          {result.get('success')}")
    print(f"container_built:  {result.get('container_built')}")
    print(f"container_cached: {result.get('container_cached')}")
    print(f"tests_executed:   {result.get('tests_executed')}")
    print(f"error:            {result.get('error')}")
    print()

    patch_results = result.get("patch_results") or []
    print(f"patch_results ({len(patch_results)}):")
    for pr in patch_results:
        print(
            f"  - {pr.get('patch_key')}: "
            f"applied={pr.get('applied')} "
            f"tests_passed={pr.get('tests_passed')} "
            f"error={pr.get('error')}"
        )
    


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Start server.py in the background and call /validate using "
            "Dockerfile and patches from tests/test_resources, to exercise "
            "apply/revert behavior."
        )
    )
    parser.add_argument(
        "--server-url",
        default="http://127.0.0.1:5050",
        help="Base URL for the validation server (default: http://127.0.0.1:5050)",
    )
    parser.add_argument(
        "--resources-dir",
        default=None,
        help="Path to test_resources directory (default: tests/test_resources relative to this file).",
    )
    parser.add_argument(
        "--no-check-only",
        action="store_true",
        help="If set, run full validation (tests) instead of check_only mode.",
    )

    args = parser.parse_args()

    # Resolve paths
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    resources_dir = (
        args.resources_dir
        if args.resources_dir
        else os.path.join(os.path.dirname(__file__), "test_resources")
    )

    if not os.path.isdir(resources_dir):
        print(f"ERROR: resources directory not found: {resources_dir}", file=sys.stderr)
        sys.exit(1)

    # Start server in background
    print(f"Starting validation server from {repo_root} ...")
    server_proc: subprocess.Popen | None = None
    try:
        server_proc = start_server_in_background(repo_root)

        print(f"Waiting for server health at {args.server_url} ...")
        wait_for_health(args.server_url, timeout=60.0)
        print("Server is healthy.")

        # Build annotation payload from test resources
        annotation = build_annotation_payload(resources_dir)
        print("Built annotation payload with keys:", sorted(annotation.keys()))

        check_only = not args.no_check_only
        print(f"Calling /validate on {args.server_url} (check_only={check_only}) ...")
        result = call_validate(args.server_url, annotation, check_only=check_only)

        summarize_result(result)

        all_applied = True
        for pr in result.get("patch_results"):
            all_applied = all_applied and pr.get('applied')

        if all_applied:
            print("\033[92mPASS\033[0m: Diff application and reverting is working properly")
            exit(0)
        else:
            print("\033[31mFAIL\033[0m: Diffs are not being applied/reverted properly")
            exit(1)

    except Exception as e:  # noqa: BLE001
        print(f"ERROR during test_revert: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if server_proc is not None:
            print("Shutting down validation server ...")
            server_proc.terminate()
            try:
                server_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                print("Server did not exit gracefully, killing it.", file=sys.stderr)
                server_proc.kill()


if __name__ == "__main__":
    main()
