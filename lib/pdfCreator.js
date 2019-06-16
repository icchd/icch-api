/**
 * @fileOverview utilities to create a PDF from a given URL.
 */

const puppeteer = require("puppeteer");

async function createBuffer (oEnv, sUrl) {
    const oBrowserOptions = {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: oEnv.PUPPETEER_EXECUTABLE_PATH
    };

    console.log("Launching with browser options:", oBrowserOptions);
    const browser = await puppeteer.launch(oBrowserOptions);

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
