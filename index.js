const Core = require("@actions/core");
const ToolCache = require("@actions/tool-cache");
const Cache = require("@actions/cache");
const IO = require("@actions/io");
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
        const params = {
            "crystal": getPlatform() === Windows ? "nightly" : "latest",
            "shards": "true",
        };
        for (const key of ["crystal", "shards", "arch"]) {
            let value;
            if ((value = Core.getInput(key))) {
                params[key] = value;
            }
        }
        params.path = Core.getInput("destination") || Path.join(
            process.env["RUNNER_TEMP"], `crystal-${params.crystal}-${params.shards}-${params.arch}`,
        );
        if (params.shards === Any && getPlatform() === Windows) {
            params.shards = Latest;
        }
        Core.setOutput("path", params.path);

        const func = {
            [Linux]: installCrystalForLinux,
            [Mac]: installCrystalForMac,
            [Windows]: installCrystalForWindows,
        }[getPlatform()];
        if (!func) {
            throw `Platform "${getPlatform()}" is not supported`;
        }
        const crystalPromise = func(params);
        params.path += "-shards";
        await maybeInstallShards(params, crystalPromise);
        await crystalPromise;

        const {stdout} = await subprocess(["crystal", "--version"]);
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
const Any = "true";
const None = "false";
const NumericVersion = /^\d[.\d]+\d$/;

function checkVersion(version, allowed) {
    const numericVersion = NumericVersion.test(version) && version;
    allowed[allowed.indexOf(NumericVersion)] = numericVersion;

    if (allowed.includes(version)) {
        return version;
    }
    if ([Latest, Nightly, numericVersion].includes(version)) {
        throw `Version "${version}" is not supported on ${getPlatform()}`;
    }
    throw `Version "${version}" is invalid`;
}

async function subprocess(command, options) {
    Core.info("[command]" + command.join(" "));
    const [file, ...args] = command;
    return execFile(file, args, options);
}

async function installCrystalForLinux({crystal, shards, arch = getArch(), path}) {
    checkVersion(crystal, [Latest, Nightly, NumericVersion]);
    const suffixes = {"x86_64": "linux-x86_64", "x86": "linux-i686"};
    checkArch(arch, Object.keys(suffixes));

    const depsTask = installAptPackages(
        "libevent-dev libgmp-dev libpcre3-dev libssl-dev libxml2-dev libyaml-dev".split(" "),
    );
    await installBinaryRelease({crystal, shards, suffix: suffixes[arch], path});

    Core.info("Setting up environment for Crystal");
    Core.addPath(Path.join(path, "bin"));
    await FS.symlink("share/crystal/src", Path.join(path, "src"));
    if (shards !== Any) {
        try {
            await FS.unlink(Path.join(path, "bin", "shards"));
        } catch (e) {}
    }
    await depsTask;
}

async function installCrystalForMac({crystal, shards, arch = "x86_64", path}) {
    checkVersion(crystal, [Latest, Nightly, NumericVersion]);
    checkArch(arch, ["x86_64"]);
    await installBinaryRelease({crystal, shards, suffix: "darwin-x86_64", path});

    Core.info("Setting up environment for Crystal");
    Core.addPath(Path.join(path, "embedded", "bin"));
    Core.addPath(Path.join(path, "bin"));
    if (shards !== Any) {
        try {
            await FS.unlink(Path.join(path, "embedded", "bin", "shards"));
        } catch (e) {}
    }

    let pkgConfigPath = "/usr/local/opt/openssl/lib/pkgconfig";
    if (process.env["PKG_CONFIG_PATH"]) {
        pkgConfigPath += Path.delimiter + process.env["PKG_CONFIG_PATH"];
    }
    Core.exportVariable("PKG_CONFIG_PATH", pkgConfigPath);
}

async function installAptPackages(packages) {
    Core.info("Installing package dependencies");
    const command = [
        "apt-get", "install", "-qy", "--no-install-recommends", "--no-upgrade", "--",
    ].concat(packages);
    if (await IO.which("sudo")) {
        command.unshift("sudo", "-n");
    }
    const {stdout} = await subprocess(command);
    Core.startGroup("Finished installing package dependencies");
    Core.info(stdout);
    Core.endGroup();
}

async function installBinaryRelease({crystal, suffix, path}) {
    if (crystal === Nightly) {
        await IO.mv(await downloadCrystalNightly(suffix), path);
    } else {
        if (crystal === Latest) {
            crystal = null;
        }
        await IO.mv(await downloadCrystalRelease(suffix, crystal), path);
    }
}

async function maybeInstallShards({shards, path, allowCache = true}, crystalPromise) {
    const allowed = [Latest, Nightly, NumericVersion, Any, None];
    let cached = false;
    checkVersion(shards, allowed);
    if (![Any, None].includes(shards)) {
        cached = await installShards({shards, path, allowCache}, crystalPromise);
    }
    if (shards !== None) {
        if (shards === Any) {
            await crystalPromise;
        }
        let result = null;
        try {
            result = await subprocess(["shards", "--version"]);
        } catch (error) {
            if (!cached) {
                throw error;
            }
            Core.warning(error);
            Core.info("Will try to rebuild");
            await crystalPromise;
            await rebuildShards({path});
            result = await subprocess(["shards", "--version"]);
        }
        const {stdout} = result;
        const [ver] = stdout.match(/\d[^ ]+/);
        if (shards === Any && ver) {
            Core.setOutput("shards", "v" + ver);
        }
        Core.info(stdout);
    }
}

async function installShards({shards, path}, crystalPromise) {
    if (NumericVersion.test(shards)) {
        shards = "v" + shards;
    }
    const ref = await findRef({name: "Shards", apiBase: GitHubApiBaseShards, version: shards});
    Core.setOutput("shards", ref);

    const cacheKey = `install-shards-v1-${ref}--${getArch()}-${getPlatform()}`;
    let restored = null;
    try {
        Core.info(`Trying to restore cache: key '${cacheKey}'`);
        restored = await Cache.restoreCache([path], cacheKey);
    } catch (error) {
        Core.warning(error.message);
    }
    if (!restored) {
        Core.info(`Cache not found for key '${cacheKey}'`);
        const fetchSrcTask = downloadSource({name: "Shards", apiBase: GitHubApiBaseShards, ref});
        await IO.mv(await fetchSrcTask, path);
        await crystalPromise;
        await rebuildShards({path});
    }
    if (restored !== cacheKey) {
        Core.info(`Saving cache: '${cacheKey}'`);
        try {
            await Cache.saveCache([path], cacheKey);
        } catch (error) {
            Core.warning(error.message);
        }
    }

    Core.info("Setting up environment for Shards");
    Core.addPath(Path.join(path, "bin"));
    return !!restored;
}

async function rebuildShards({path}) {
    Core.info("Building Shards");
    await subprocess(["make", "clean"], {cwd: path});
    const {stdout} = await subprocess(["make"], {cwd: path});
    Core.startGroup("Finished building Shards");
    Core.info(stdout);
    Core.endGroup();
}

const GitHubApiBase = "/repos/crystal-lang/crystal";
const GitHubApiBaseShards = "/repos/crystal-lang/shards";
const CircleApiBase = "https://circleci.com/api/v1.1/project/github/crystal-lang/crystal";

async function findRelease({name, apiBase, tag}) {
    Core.info(`Looking for ${name} release (${tag || "latest"})`);
    const releasesResp = await githubGet({
        url: apiBase + "/releases/" + (tag ? "tags/" + tag : "latest"),
    });
    const release = releasesResp.data;
    Core.info(`Found ${name} release ${release["html_url"]}`);
    return release;
}

async function findLatestCommit({name, apiBase, branch = "master"}) {
    Core.info(`Looking for latest ${name} commit`);
    const commitsResp = await githubGet({
        url: apiBase + "/commits/:branch",
        "branch": branch,
    });
    const commit = commitsResp.data;
    Core.info(`Found ${name} commit ${commit["html_url"]}`);
    return commit["sha"];
}

async function downloadCrystalRelease(suffix, version = null) {
    const release = await findRelease({name: "Crystal", apiBase: GitHubApiBase, tag: version});
    Core.setOutput("crystal", release["tag_name"]);

    const asset = release["assets"].find((a) => a["name"].endsWith([`-${suffix}.tar.gz`]));

    Core.info(`Downloading Crystal build from ${asset["url"]}`);
    const downloadedPath = await githubDownloadViaRedirect({
        url: asset["url"],
        headers: {"accept": "application/octet-stream"},
    });

    Core.info("Extracting Crystal build");
    const extractedPath = await ToolCache.extractTar(downloadedPath);
    return onlySubdir(extractedPath);
}

async function findRef({name, apiBase, version}) {
    if (version === Nightly) {
        return findLatestCommit({name, apiBase});
    } else if (version === Latest) {
        const release = await findRelease({name, apiBase});
        return release["tag_name"];
    }
    return version;
}

async function downloadSource({name, apiBase, ref}) {
    Core.info(`Downloading ${name} source for ${ref}`);
    const downloadedPath = await githubDownloadViaRedirect({
        url: apiBase + "/zipball/:ref",
        "ref": ref,
    });
    Core.info(`Extracting ${name} source`);
    return onlySubdir(await ToolCache.extractZip(downloadedPath));
}

async function downloadCrystalNightly(suffix) {
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
    Core.info(`Found Crystal build ${build["build_url"]}`);
    Core.setOutput("crystal", build["vcs_revision"]);

    const req = `/${build["build_num"]}/artifacts`;
    const resp = await fetch(CircleApiBase + req);
    const artifacts = await resp.json();
    const artifact = artifacts.find((a) => a["path"].endsWith(`-${suffix}.tar.gz`));

    Core.info(`Downloading Crystal build from ${artifact["url"]}`);
    const downloadedPath = await ToolCache.downloadTool(artifact["url"]);
    Core.info("Extracting Crystal build");
    const extractedPath = await ToolCache.extractTar(downloadedPath);
    return onlySubdir(extractedPath);
}

async function installCrystalForWindows({crystal, arch = "x86_64", path}) {
    checkVersion(crystal, [Nightly]);
    checkArch(arch, ["x86_64"]);
    await IO.mv(await downloadCrystalNightlyForWindows(), path);

    Core.info("Setting up environment for Crystal");
    const vars = await variablesForVCBuildTools();
    addPathToVars(vars, "PATH", Path.join(path, "bin"));
    addPathToVars(vars, "LIB", Path.join(path, "bin"));
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

async function downloadCrystalNightlyForWindows() {
    Core.info("Looking for latest Crystal build");

    const runsResp = await githubGet({
        url: GitHubApiBase + "/actions/workflows/win.yml/runs?branch=master&event=push&status=success",
        "per_page": 1,
    });
    const [workflowRun] = runsResp.data["workflow_runs"];
    const {"head_sha": ref, "id": runId} = workflowRun;
    Core.info(`Found Crystal release ${workflowRun["html_url"]}`);
    Core.setOutput("crystal", ref);

    const fetchSrcTask = downloadSource({name: "Crystal", apiBase: GitHubApiBase, ref});
    const fetchExeTask = (async () => {
        const artifactsResp = await githubGet({
            url: GitHubApiBase + "/actions/runs/:run_id/artifacts",
            "run_id": runId,
        });
        const artifact = artifactsResp.data["artifacts"].find((x) => x.name === "crystal");

        Core.info("Downloading Crystal build");
        const downloadedPath = await githubDownloadViaRedirect({
            url: GitHubApiBase + "/actions/artifacts/:artifact_id/zip",
            "artifact_id": artifact.id,
        });

        Core.info("Extracting Crystal build");
        return ToolCache.extractZip(downloadedPath);
    })();

    const path = await fetchSrcTask;
    await IO.rmRF(Path.join(path, "bin"));
    await IO.mv(await fetchExeTask, Path.join(path, "bin"));
    return path;
}

function githubGet(request) {
    Core.debug(request);
    return Octokit.request.defaults({
        headers: {"authorization": "token " + Core.getInput("token")},
    })(request);
}

async function githubDownloadViaRedirect(request) {
    request.request = {redirect: "manual"};
    const resp = await githubGet(request);
    return ToolCache.downloadTool(resp.headers["location"]);
}

async function onlySubdir(path) {
    const [subDir] = await FS.readdir(path);
    return Path.join(path, subDir);
}

if (require.main === module) {
    run();
}
