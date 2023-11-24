import subprocess

def define_env(env):
    rev = subprocess.check_output("git rev-parse v1".split(), encoding="utf-8").strip()
    tag = subprocess.check_output("git describe --exact-match v1".split(), encoding="utf-8").strip()
    env.variables["latest_rev"] = rev
    env.variables["latest_tag"] = tag
