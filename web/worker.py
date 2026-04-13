from __future__ import annotations

import ctypes
import os
import sys
from pathlib import Path


def _candidate_bin_dirs(base_dir: Path) -> list[Path]:
    dirs: list[Path] = [base_dir / "release"]
    env_paths = [
        os.environ.get("MINGW_PREFIX"),
        os.environ.get("MSYSTEM_PREFIX"),
    ]
    for p in env_paths:
        if p:
            dirs.append(Path(p) / "bin")

    dirs.extend(
        [
            Path(r"C:\msys64\ucrt64\bin"),
            Path(r"C:\msys64\mingw64\bin"),
            Path(r"C:\msys64\clang64\bin"),
        ]
    )
    return dirs


def _setup_dll_search_paths(base_dir: Path) -> None:
    seen: set[str] = set()
    valid_dirs: list[str] = []
    for d in _candidate_bin_dirs(base_dir):
        s = str(d.resolve())
        if s in seen or not d.exists():
            continue
        seen.add(s)
        valid_dirs.append(s)
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(s)

    path_parts = [os.environ.get("PATH", "")]
    path_parts.extend(valid_dirs)
    os.environ["PATH"] = os.pathsep.join([p for p in path_parts if p])


def main() -> int:
    if len(sys.argv) != 5:
        print("usage: worker.py <base_dir> <command_file> <resource_dir> <mode>")
        return 2

    base_dir = Path(sys.argv[1]).resolve()
    command_file = Path(sys.argv[2]).resolve()
    resource_dir = Path(sys.argv[3]).resolve()
    mode = sys.argv[4]

    os.chdir(base_dir)
    _setup_dll_search_paths(base_dir)
    dll = base_dir / "release" / "api.dll"
    if not dll.exists():
        print(f"api.dll not found: {dll}")
        return 3

    try:
        lib = ctypes.CDLL(str(dll))
    except OSError as e:
        print(f"failed to load {dll}: {e}")
        return 4
    lib.api.restype = ctypes.c_int
    lib.api.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p]

    rc = lib.api(
        str(command_file).encode("utf-8"),
        str(resource_dir).encode("utf-8"),
        mode.encode("utf-8"),
    )
    return int(rc)


if __name__ == "__main__":
    raise SystemExit(main())
