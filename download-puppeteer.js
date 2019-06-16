const {resolve} = require("path");
const TARGET_DOWNLOAD_DIR = "/tmp";
const { spawn } = require('child_process');

async function setupPuppeteer () {
    var sDownloadPath = resolve(TARGET_DOWNLOAD_DIR);
    console.log("downloading puppeteer at " + sDownloadPath);
    var puppeteer = require("puppeteer");
    const browserFetcher = puppeteer.createBrowserFetcher({
        path: sDownloadPath,
        platform: "linux"
    });
    const revisionInfo = await browserFetcher.download('662092');
    return revisionInfo;
}

async function runCommand (sCommand, aArgs) {
    return new Promise ((fnResolve) => {
        const cmd = spawn(sCommand, aArgs);
        cmd.stdout.on("data", (data) => {
          console.log(`[${sCommand} (ii)] ${data.toString()}`);
        });
        cmd.stderr.on("data", (data) => {
          console.log(`[${sCommand} (ee)] ${data.toString()}`);
        });
        cmd.on("close", (code) => {
          console.log(`[${sCommand}] exited with status code ${code}`);
          fnResolve();
        });
    });
}

async function download () {
    const puppeteerRevisionInfo = await setupPuppeteer();

    const testFolder = TARGET_DOWNLOAD_DIR;
    const fs = require('fs');
    fs.readdir(testFolder, (err, files) => {
      console.log("listing " + TARGET_DOWNLOAD_DIR);
      files.forEach(file => {
        console.log(file);
      });
      console.log("end of dir content.");

      console.log("Puppeteer revision info:");
      console.log(puppeteerRevisionInfo);
      console.log("done");

      runCommand("/bin/ls", ["-lahtr", puppeteerRevisionInfo.executablePath]);
    });

}

module.exports = {
    download
};
