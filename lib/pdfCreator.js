/**
 * @fileOverview utilities to create a PDF from a given URL.
 */

let puppeteerRevisionInfo = null;

async function setupPuppeteer () {
    var puppeteer = require("puppeteer");
    const browserFetcher = puppeteer.createBrowserFetcher({
        path: "/mnt/.local-chromium",
        platform: "linux"
    });
    const revisionInfo = await browserFetcher.download('662092');
    return revisionInfo;
}

async function createBuffer (oEnv, sUrl) {
    const bOnCloudService = oEnv.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === "true";
    const puppeteer = require("puppeteer");
    if (bOnCloudService && !puppeteerRevisionInfo) {
        console.log("downloading puppeteer...");
        puppeteerRevisionInfo = await setupPuppeteer();
        console.log("done");
    } else {
        console.log("no need to download...");
    }

    const oBrowserOptions = puppeteerRevisionInfo
      ? {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          executablePath: puppeteerRevisionInfo.executablePath
      } : null;

    console.log("Launching with browser options:", oBrowserOptions);

    let browser = null;
    if (oBrowserOptions) {
        /* deleteme */
        const testFolder = '/mnt/';
        const fs = require('fs');

        fs.readdir(testFolder, (err, files) => {
          files.forEach(file => {
            console.log(file);
          });
        });
        /* end of deleteme */

        browser = await puppeteer.launch(oBrowserOptions);
    } else {
        browser = await puppeteer.launch();
    }

    const page = await browser.newPage();

    console.log("Going to URL:" + sUrl);
    await page.goto(sUrl, {
        waitUntil: "networkidle0"
    });
    const buffer = await page.pdf({format: "A4"});

    console.log("Closing browser");
    await browser.close();

    return buffer;
}

module.exports = {
    createBuffer
};
