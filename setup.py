"""Bundle only fixed public runtime assets, independently of the launch CWD."""
from pathlib import Path
import shutil
import runpy
from setuptools import setup
from setuptools.command.build_py import build_py

class BuildPublic(build_py):
    def run(self):
        super().run()
        root = Path(__file__).parent
        target = Path(self.build_lib) / 'agent_work_ledger' / 'public'
        if target.exists():
            shutil.rmtree(target)
        for name in runpy.run_path(str(root / 'agent_work_ledger/assets.py'))['PUBLIC_FILES']:
            destination = target / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / 'web' / name, destination)

setup(cmdclass={'build_py': BuildPublic})
