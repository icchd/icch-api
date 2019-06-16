const {resolve} = require("path");
const TARGET_DOWNLOAD_DIR = "/tmp";

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

async function download () {
    const puppeteerRevisionInfo = await setupPuppeteer();

    console.log("listing " + TARGET_DOWNLOAD_DIR);
    const testFolder = TARGET_DOWNLOAD_DIR;
    const fs = require('fs');
    fs.readdir(testFolder, (err, files) => {
      files.forEach(file => {
        console.log(file);
      });
    });
    console.log("end of dir content.");

    console.log("Puppeteer revision info:");
    console.log(puppeteerRevisionInfo);
    console.log("done");
}

module.exports = {
    download
};
