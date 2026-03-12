from cx_Freeze import setup, Executable

# Dependencies are automatically detected, but it might need fine tuning.
build_exe_options = {
    "packages": ["libtorrent"],
    "excludes": ["tkinter", "tk", "tcl"],
    "build_exe": "hachimi-python-rpc",
    "include_msvcr": True
}

setup(
    name="hachimi-python-rpc",
    version="0.1",
    description="Hachimi",
    options={"build_exe": build_exe_options},
    executables=[Executable(
      "python_rpc/main.py",
      target_name="hachimi-python-rpc",
      icon="build/icon.ico"
    )]
)
