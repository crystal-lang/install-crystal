const Core = require("@actions/core");
const ToolCache = require("@actions/tool-cache");
const Octokit = require("@octokit/request");
const Path = require("path");
const ChildProcess = require("child_process");
const Util = require("util");
const FS = require("fs").promises;

async function run() {
    try {
        const path = await downloadCrystalForWindows();
        await setupCrystalForWindows(path);
    } catch (error) {
        Core.setFailed(error);
    }
}

async function setupCrystalForWindows(path) {
    Core.info("Setting up environment");
    const vars = await variablesForVCBuildTools();
    addPathToVars(vars, "PATH", path);
    addPathToVars(vars, "LIB", path);
    addPathToVars(vars, "CRYSTAL_PATH", Path.join(path, "src"));
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
    const exec = Util.promisify(ChildProcess.exec);
    const command = `set && echo ${outputSep} && "${vcvarsPath}" >nul && set`;
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

async function downloadCrystalForWindows() {
    Core.info("Looking for latest Crystal build");

    const runsResp = await githubGet({
        url: "/repos/crystal-lang/crystal/actions/workflows/win.yml/runs?branch=master&event=push&status=success",
        "per_page": 1,
    });
    const [workflowRun] = runsResp.data["workflow_runs"];
    const {"head_sha": ref, "id": runId} = workflowRun;
    Core.info("Found " + workflowRun["html_url"]);
    Core.setOutput("crystal", ref);

    const fetchSrcTask = async (destDir) => {
        const zipballLinkResp = await githubGet({
            url: "/repos/crystal-lang/crystal/zipball/:ref",
            "ref": ref,
            request: {redirect: "manual"},
        });
        const downloadUrl = zipballLinkResp.headers["location"];
        Core.info("Found " + downloadUrl);

        Core.info("Downloading Crystal source");
        const downloadedPath = await ToolCache.downloadTool(downloadUrl);

        Core.info("Extracting Crystal source");
        const extractedPath = await ToolCache.extractZip(downloadedPath, destDir);
        const [subDir] = await FS.readdir(extractedPath);
        return Path.join(extractedPath, subDir);
    };

    const fetchExeTask = async () => {
        const artifactsResp = await githubGet({
            url: "/repos/crystal-lang/crystal/actions/runs/:run_id/artifacts",
            "run_id": runId,
        });
        const artifact = artifactsResp.data["artifacts"].find((x) => x.name === "crystal");

        const artifactLinkResp = await githubGet({
            url: "/repos/crystal-lang/crystal/actions/artifacts/:artifact_id/zip",
            "artifact_id": artifact.id,
            headers: {"authorization": "token " + Core.getInput("token")},
            request: {redirect: "manual"},
        });
        const downloadUrl = artifactLinkResp.headers["location"];

        Core.info("Downloading Crystal build");
        return ToolCache.downloadTool(downloadUrl);
    };

    const [srcPath, exeDownloadedPath] = await Promise.all([
        fetchSrcTask(Core.getInput("destination")),
        fetchExeTask(),
    ]);

    Core.info("Extracting Crystal build");
    return ToolCache.extractZip(exeDownloadedPath, srcPath);
}

function githubGet(request) {
    Core.debug(request);
    return Octokit.request(request);
}

if (require.main === module) {
    run();
}
