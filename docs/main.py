import subprocess

def define_env(env):
    command = "git rev-parse v1".split()
    rev = subprocess.check_output(command, encoding="utf-8").strip()
    env.variables["latest_rev"] = rev
