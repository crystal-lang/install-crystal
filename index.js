import Cache from "@actions/cache";
import ChildProcess from "child_process";
import Core from "@actions/core";
import {promises as FS} from "fs";
import Glob from "@actions/glob";
import IO from "@actions/io";
import {Octokit} from "@octokit/rest";
import Path from "path";
import ToolCache from "@actions/tool-cache";
import URL from "url";
import Util from "util";
import {cmpTags} from "tag-cmp";
import fetch from "node-fetch";

const execFile = Util.promisify(ChildProcess.execFile);

async function run() {
    try {
        const params = {
            "crystal": "latest",
            "shards": "true",
        };
        for (const key of ["crystal", "shards", "arch"]) {
            let value;
            if ((value = Core.getInput(key))) {
                params[key] = value;
            }
        }
        if (params.crystal === "master") {
            params.crystal = "nightly";
        }
        if (params.shards === "master") {
            params.shards = "nightly";
        }
        params.path = Core.getInput("destination") || Path.join(
            process.env["RUNNER_TEMP"], `crystal-${params.crystal}-${params.shards}-${params.arch}`,
        );
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

        if (!Core.getInput("annotate") || Core.getBooleanInput("annotate")) {
            const scriptDir = Path.dirname(URL.fileURLToPath(import.meta.url));
            const matchersPath = Path.join(scriptDir, ".github");
            Core.info(`::add-matcher::${Path.join(matchersPath, "crystal.json")}`);
            Core.info(`::add-matcher::${Path.join(matchersPath, "crystal-spec.json")}`);
        }
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
const NumericVersion = /^\d([.\d]*\d)?$/;

function checkVersion(version, allowed, earliestAllowed = null) {
    const numericVersion = NumericVersion.test(version) && version;
    if (numericVersion && (!earliestAllowed || cmpTags(numericVersion, earliestAllowed) >= 0)) {
        allowed[allowed.indexOf(NumericVersion)] = numericVersion;
    }

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
    try {
        return await execFile(file, args, options);
    } catch (error) {
        Core.info(error.stdout);
        Core.info("---");
        throw error;
    }
}

async function installCrystalForLinux({crystal, shards, arch = getArch(), path}) {
    checkVersion(crystal, [Latest, Nightly, NumericVersion]);
    const filePatterns = {"x86_64": /-linux-x86_64\.tar\.gz$/, "x86": /-linux-i686\.tar\.gz$/};
    checkArch(arch, Object.keys(filePatterns));

    const depsTask = installAptPackages(
        "libevent-dev libgmp-dev libpcre2-dev libssl-dev libxml2-dev libyaml-dev".split(" "),
    );
    await installBinaryRelease({crystal, shards, filePattern: filePatterns[arch], path});

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
    if (crystal === Latest || crystal === Nightly || cmpTags(crystal, "1.2") >= 0) {
        checkArch(arch, ["universal", "x86_64", "aarch64"]);
    } else {
        checkArch(arch, ["x86_64"]);
    }
    const filePattern = /-darwin-(universal|x86_64)\.tar\.gz$/;
    await installBinaryRelease({crystal, shards, filePattern, path});

    Core.info("Setting up environment for Crystal");
    Core.addPath(Path.join(path, "embedded", "bin"));
    Core.addPath(Path.join(path, "bin"));
    if (shards !== Any) {
        try {
            await FS.unlink(Path.join(path, "embedded", "bin", "shards"));
        } catch (e) {}
    }

    const globber = await Glob.create([
        "/usr/local/Cellar/openssl*/*/lib/pkgconfig",
        "/usr/local/opt/openssl/lib/pkgconfig",
    ].join("\n"));
    let [pkgConfigPath] = await globber.glob();
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

async function installBinaryRelease({crystal, filePattern, path}) {
    if (crystal === Nightly) {
        await IO.mv(await downloadCrystalNightly(filePattern), path);
    } else {
        if (crystal === Latest) {
            crystal = null;
        }
        await IO.mv(await downloadCrystalRelease(filePattern, crystal), path);
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
    const ref = await findRef({name: "Shards", repo: RepoShards, version: shards});
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
        const fetchSrcTask = downloadSource({name: "Shards", repo: RepoShards, ref});
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
    await subprocess(["make"], {cwd: path});
    Core.startGroup("Finished building Shards");
    Core.endGroup();
}

const RepoCrystal = {owner: "crystal-lang", repo: "crystal"};
const RepoShards = {owner: "crystal-lang", repo: "shards"};
const CircleApiBase = "https://circleci.com/api/v1.1/project/github/crystal-lang/crystal";

async function findRelease({name, repo, tag}) {
    if (!(/^\d+\.\d+\.\d\w*$/.test(tag))) {
        tag = await getLatestTag({repo, prefix: tag});
    }
    Core.info(`Getting ${name} release (${tag})`);
    const releasesResp = await github.rest.repos.getReleaseByTag({...repo, tag});
    const release = releasesResp.data;
    Core.info(`Found ${name} release ${release["html_url"]}`);
    return release;
}

async function getLatestTag({repo, prefix}) {
    Core.info(`Looking for ${repo.owner}/${repo.owner} release (${prefix || "latest"})`);
    const pages = github.repos.listReleases.endpoint.merge({
        ...repo, "per_page": 50,
    });

    const tags = [];
    let assurance = 25;
    for await (const item of getItemsFromPages(pages)) {
        const tag = item["tag_name"];
        if (!prefix || tag === prefix || tag.startsWith(prefix + ".")) {
            tags.push(tag);
        }
        if (tags.length) {
            if (--assurance <= 0) {
                break;
            }
        }
    }
    if (tags.length === 0) {
        let error = `The repository "${repo.owner}/${repo.repo}" has no releases matching "${prefix}.*"`;
        throw error;
    }
    tags.sort(cmpTags);
    tags.reverse();
    Core.debug(`Considered tags ${tags.join("|")}`);
    return tags[0];
}

async function findLatestCommit({name, repo, branch = "master"}) {
    Core.info(`Looking for latest ${name} commit`);
    const commitsResp = await github.rest.repos.getCommit({
        ...repo, "ref": branch,
    });
    const commit = commitsResp.data;
    Core.info(`Found ${name} commit ${commit["html_url"]}`);
    return commit["sha"];
}

async function downloadCrystalRelease(filePattern, version = null) {
    const release = await findRelease({name: "Crystal", repo: RepoCrystal, tag: version});
    Core.setOutput("crystal", release["tag_name"]);

    const asset = release["assets"].find((a) => filePattern.test(a["name"]));

    Core.info(`Downloading Crystal build from ${asset["url"]}`);
    const resp = await github.request({
        url: asset["url"],
        headers: {"accept": "application/octet-stream"},
        request: {redirect: "manual"},
    });
    const url = resp.headers["location"];

    const downloadedPath = await ToolCache.downloadTool(url);
    Core.info("Extracting Crystal build");
    const dl = (asset["name"].endsWith(".zip") ? ToolCache.extractZip : ToolCache.extractTar);
    const extractedPath = await dl(downloadedPath);
    return onlySubdir(extractedPath);
}

async function findRef({name, repo, version}) {
    const v = version.replace(/^v/, "");
    if (version === Nightly) {
        return findLatestCommit({name, repo});
    } else if (version === Latest) {
        const release = await findRelease({name, repo});
        return release["tag_name"];
    } else if (NumericVersion.test(v) && !(/^\d+\.\d+\.\d\w*$/.test(v))) {
        return getLatestTag({repo, prefix: version});
    }
    return version;
}

async function downloadSource({name, repo, ref}) {
    Core.info(`Downloading ${name} source for ${ref}`);

    const resp = await github.rest.repos.downloadZipballArchive({
        ...repo, ref,
        request: {redirect: "manual"},
    });
    const url = resp.headers["location"];
    const downloadedPath = await ToolCache.downloadTool(url);
    Core.info(`Extracting ${name} source`);
    return onlySubdir(await ToolCache.extractZip(downloadedPath));
}

async function downloadCrystalNightly(filePattern) {
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
    const artifact = artifacts.find((a) => filePattern.test(a["path"]));

    Core.info(`Downloading Crystal build from ${artifact["url"]}`);
    const downloadedPath = await ToolCache.downloadTool(artifact["url"]);
    Core.info("Extracting Crystal build");
    const extractedPath = await ToolCache.extractTar(downloadedPath);
    return onlySubdir(extractedPath);
}

async function installCrystalForWindows({crystal, shards, arch = "x86_64", path}) {
    checkVersion(crystal, [Latest, Nightly, NumericVersion], "1.3");
    checkArch(arch, ["x86_64"]);

    if (crystal === Nightly) {
        await IO.mv(await downloadCrystalNightlyForWindows(), path);
    } else {
        const filePattern = /-windows-x86_64-msvc(-unsupported)?\.zip$/;
        await installBinaryRelease({crystal, shards, filePattern, path});
    }

    Core.info("Setting up environment for Crystal");
    Core.addPath(path);
    if (shards !== Any) {
        try {
            await FS.unlink(Path.join(path, "shards.exe"));
        } catch (e) {}
    }
}

async function downloadCrystalNightlyForWindows() {
    Core.info("Looking for latest Crystal build");

    const runsResp = await github.rest.actions.listWorkflowRuns({
        ...RepoCrystal, "workflow_id": "win.yml", "branch": "master",
        "event": "push", "status": "success", "per_page": 1,
    });
    const [workflowRun] = runsResp.data["workflow_runs"];
    const {"head_sha": ref, "id": runId} = workflowRun;
    Core.info(`Found Crystal release ${workflowRun["html_url"]}`);
    Core.setOutput("crystal", ref);

    const artifactsResp = await github.rest.actions.listWorkflowRunArtifacts({
        ...RepoCrystal, "run_id": runId,
    });
    const artifact = artifactsResp.data["artifacts"].find((x) => x.name === "crystal");

    Core.info("Downloading Crystal build");
    const resp = await github.rest.actions.downloadArtifact({
        ...RepoCrystal, "artifact_id": artifact.id, "archive_format": "zip",
        request: {redirect: "manual"},
    });
    const url = resp.headers["location"];
    const downloadedPath = await ToolCache.downloadTool(url);

    Core.info("Extracting Crystal build");
    return ToolCache.extractZip(downloadedPath);
}

const github = new Octokit({auth: Core.getInput("token") || null});

async function* getItemsFromPages(pages) {
    for await (const page of github.paginate.iterator(pages)) {
        for (const item of page.data) {
            yield item;
        }
    }
}

async function onlySubdir(path) {
    const subDirs = await FS.readdir(path);
    if (subDirs.length === 1) {
        path = Path.join(path, subDirs[0]);
    }
    return path;
}

run();
