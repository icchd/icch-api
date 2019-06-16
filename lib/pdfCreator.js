/**
 * @fileOverview utilities to create a PDF from a given URL.
 */

async function createBuffer (oEnv, sUrl) {
    const puppeteer = require("puppeteer");

    const oBrowserOptions = oEnv.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === "true"
      ? {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          executablePath: "/home/darksmo/.local-chromium/linux-662092/chrome-linux/chrome"
      } : null;

    console.log("Launching with browser options:", oBrowserOptions);

    let browser = null;
    if (oBrowserOptions) {
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
