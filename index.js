const Core = require("@actions/core");
const ToolCache = require("@actions/tool-cache");
const Octokit = require("@octokit/request");
const fetch = require("node-fetch");
const Path = require("path");
const ChildProcess = require("child_process");
const Util = require("util");
const FS = require("fs").promises;

const exec = Util.promisify(ChildProcess.exec);
const execFile = Util.promisify(ChildProcess.execFile);

async function run() {
    try {
        const params = {};
        for (const key of ["crystal", "arch", "destination"]) {
            let value;
            if ((value = Core.getInput(key))) {
                params[key] = value;
            }
        }
        const func = {
            [Linux]: installCrystalForLinux,
            [Mac]: installCrystalForMac,
            [Windows]: installCrystalForWindows,
        }[getPlatform()];
        if (!func) {
            throw `Platform "${getPlatform()}" is not supported`;
        }
        await func(params);

        Core.info("[command]crystal --version");
        const {stdout} = await execFile("crystal", ["--version"]);
        Core.info(stdout);
    } catch (error) {
        Core.setFailed(error);
        process.exit(1);
    }
}

const Linux = "Linux", Mac = "macOS", Windows = "Windows";

function getPlatform() {
    const platform = process.env["INSTALL_CRYSTAL_PLATFORM"] || process.platform;
    return {"linux": Linux, "darwin": Mac, "win32": Windows}[platform] || platform;
}

function getArch() {
    return {"ia32": "x86", "x64": "x86_64"}[process.arch] || process.arch;
}

function checkArch(arch, allowed) {
    if (!allowed.includes(arch)) {
        throw `Architecture "${arch}" is not supported on ${getPlatform()}`;
    }
}

const Latest = "latest";
const Nightly = "nightly";
const NumericVersion = /^\d[.\d]+\d$/;

function checkVersion(version, allowed) {
    const numericVersion = version.match(NumericVersion) && version;
    allowed[allowed.indexOf(NumericVersion)] = numericVersion;

    if (allowed.includes(version)) {
        return version;
    }
    if ([Latest, Nightly, numericVersion].includes(version)) {
        throw `Version "${version}" is not supported on ${getPlatform()}`;
    }
    throw `Version "${version}" is invalid`;
}

async function installCrystalForLinux({
    crystal = Latest,
    arch = getArch(),
    destination = null,
}) {
    checkVersion(crystal, [Latest, Nightly, NumericVersion]);
    const suffixes = {"x86_64": "linux-x86_64", "x86": "linux-i686"};
    checkArch(arch, Object.keys(suffixes));

    return Promise.all([
        installAptPackages(
            "libevent-dev libgmp-dev libpcre3-dev libssl-dev libxml2-dev libyaml-dev".split(" "),
        ),
        installBinaryRelease({crystal, suffix: suffixes[arch], destination}),
    ]);
}

async function installCrystalForMac({
    crystal = Latest,
    arch = "x86_64",
    destination = null,
}) {
    checkVersion(crystal, [Latest, Nightly, NumericVersion]);
    checkArch(arch, ["x86_64"]);
    return installBinaryRelease({crystal, suffix: "darwin-x86_64", destination});
}

async function installAptPackages(packages) {
    Core.info("Installing package dependencies");
    const args = [
        "-n", "apt-get", "install", "-qy", "--no-install-recommends", "--no-upgrade", "--",
    ].concat(packages);
    Core.info("[command]sudo " + args.join(" "));
    const {stdout} = await execFile("sudo", args);
    Core.startGroup("Finished installing package dependencies");
    Core.info(stdout);
    Core.endGroup();
}

async function installBinaryRelease({crystal, suffix, destination}) {
    let path;
    if (crystal === Nightly) {
        path = await downloadCrystalNightly(suffix, destination);
    } else {
        if (crystal === Latest) {
            crystal = null;
        }
        path = await downloadCrystalRelease(suffix, crystal, destination);
    }

    Core.info("Setting up environment");
    Core.addPath(Path.join(path, "embedded", "bin"));
    Core.addPath(Path.join(path, "bin"));
}

const GitHubApiBase = "/repos/crystal-lang/crystal";
const CircleApiBase = "https://circleci.com/api/v1.1/project/github/crystal-lang/crystal";

async function downloadCrystalRelease(suffix, tag = null, destination = null) {
    Core.info("Looking for latest Crystal release");

    const releasesResp = await githubGet({
        url: GitHubApiBase + "/releases/" + (tag ? "tags/" + tag : "latest"),
    });
    const release = releasesResp.data;
    Core.info("Found " + release["html_url"]);
    Core.setOutput("crystal", release["tag_name"]);

    const asset = release["assets"].find((a) => a["name"].endsWith([`-${suffix}.tar.gz`]));

    Core.info("Downloading Crystal build");
    const downloadedPath = await ToolCache.downloadTool(asset["browser_download_url"]);

    Core.info("Extracting Crystal build");
    return onlySubdir(await ToolCache.extractTar(downloadedPath, destination));
}

async function downloadCrystalNightly(suffix, destination = null) {
    Core.info("Looking for latest Crystal build");

    let build;
    for (let offset = 0; ;) {
        const req = `/tree/master?filter=successful&shallow=true&limit=100&offset=${offset}`;
        const resp = await fetch(CircleApiBase + req);
        const builds = await resp.json();
        build = builds.find((b) => b["workflows"]["job_name"] === "dist_artifacts");
        if (build) {
            break;
        }
        offset += builds.length;
        if (offset >= 1000) {
            throw "Could not find a matching nightly build";
        }
    }
    Core.info("Found " + build["build_url"]);
    Core.setOutput("crystal", build["vcs_revision"]);

    const req = `/${build["build_num"]}/artifacts`;
    const resp = await fetch(CircleApiBase + req);
    const artifacts = await resp.json();
    const artifact = artifacts.find((a) => a["path"].endsWith(`-${suffix}.tar.gz`));
    Core.info("Found " + artifact["url"]);

    Core.info("Downloading Crystal build");
    const downloadedPath = await ToolCache.downloadTool(artifact["url"]);

    Core.info("Extracting Crystal build");
    return onlySubdir(await ToolCache.extractTar(downloadedPath, destination));
}

async function installCrystalForWindows({
    crystal = Nightly,
    arch = "x86_64",
    destination = null,
}) {
    checkVersion(crystal, [Nightly]);
    checkArch(arch, ["x86_64"]);
    const path = await downloadCrystalNightlyForWindows(destination);
    await setupCrystalForWindows(path);
}

async function setupCrystalForWindows(path) {
    Core.info("Setting up environment");
    const vars = await variablesForVCBuildTools();
    addPathToVars(vars, "PATH", path);
    addPathToVars(vars, "LIB", path);
    addPathToVars(vars, "CRYSTAL_PATH", Path.join(path, "src"));
    addPathToVars(vars, "CRYSTAL_PATH", "lib");
    for (const [k, v] of vars.entries()) {
        Core.exportVariable(k, v);
    }
}

function addPathToVars(vars, key, value) {
    for (const [k, v] of vars.entries()) {
        if (k.toLowerCase() === key.toLowerCase()) {
            return vars.set(k, value + Path.delimiter + v);
        }
    }
    return vars.set(key, value);
}

const outputSep = "---";
const vcvarsPath = String.raw`C:\Program Files (x86)\Microsoft Visual Studio\2019\Enterprise\VC\Auxiliary\Build\vcvars64.bat`;

async function variablesForVCBuildTools() {
    const command = `set && echo ${outputSep} && "${vcvarsPath}" >nul && set`;
    Core.info(`[command]cmd /c "${command}"`);
    const {stdout} = await exec(command, {shell: "cmd"});
    Core.debug(JSON.stringify(stdout));
    return new Map(getChangedVars(stdout.trimEnd().split(/\r?\n/)));
}

function* getChangedVars(lines) {
    const vars = new Map();
    lines = lines[Symbol.iterator]();
    for (const line of lines) {
        if (line.trimEnd() === outputSep) {
            break;
        }
        const [key, value] = line.split(/=(.+)/, 2);
        vars.set(key.toLowerCase(), value);
    }
    for (const line of lines) {
        const [key, value] = line.split(/=(.+)/, 2);
        if (vars.get(key.toLowerCase()) !== value) {
            yield [key, value];
        } else {
            Core.debug("Unchanged: " + key);
        }
    }
}

async function downloadCrystalNightlyForWindows(destination = null) {
    Core.info("Looking for latest Crystal build");

    const runsResp = await githubGet({
        url: GitHubApiBase + "/actions/workflows/win.yml/runs?branch=master&event=push&status=success",
        "per_page": 1,
    });
    const [workflowRun] = runsResp.data["workflow_runs"];
    const {"head_sha": ref, "id": runId} = workflowRun;
    Core.info("Found " + workflowRun["html_url"]);
    Core.setOutput("crystal", ref);

    const fetchSrcTask = async (destDir) => {
        const zipballLinkResp = await githubGet({
            url: GitHubApiBase + "/zipball/:ref",
            "ref": ref,
            request: {redirect: "manual"},
        });
        const downloadUrl = zipballLinkResp.headers["location"];
        Core.info("Found " + downloadUrl);

        Core.info("Downloading Crystal source");
        const downloadedPath = await ToolCache.downloadTool(downloadUrl);

        Core.info("Extracting Crystal source");
        return onlySubdir(await ToolCache.extractZip(downloadedPath, destDir));
    };

    const fetchExeTask = async () => {
        const artifactsResp = await githubGet({
            url: GitHubApiBase + "/actions/runs/:run_id/artifacts",
            "run_id": runId,
        });
        const artifact = artifactsResp.data["artifacts"].find((x) => x.name === "crystal");

        const artifactLinkResp = await githubGet({
            url: GitHubApiBase + "/actions/artifacts/:artifact_id/zip",
            "artifact_id": artifact.id,
            request: {redirect: "manual"},
        });
        const downloadUrl = artifactLinkResp.headers["location"];

        Core.info("Downloading Crystal build");
        return ToolCache.downloadTool(downloadUrl);
    };

    const [srcPath, exeDownloadedPath] = await Promise.all([
        fetchSrcTask(destination),
        fetchExeTask(),
    ]);

    Core.info("Extracting Crystal build");
    return ToolCache.extractZip(exeDownloadedPath, srcPath);
}

function githubGet(request) {
    Core.debug(request);
    return Octokit.request.defaults({
        headers: {"authorization": "token " + Core.getInput("token")},
    })(request);
}

async function onlySubdir(path) {
    const [subDir] = await FS.readdir(path);
    return Path.join(path, subDir);
}

if (require.main === module) {
    run();
}
