import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        // هذا السطر مهم جداً لجلب نسخة Chromium المتوافقة مع Vercel
        const executablePath = await chromium.executablePath(
            `https://github.com/sparticuz/chromium/releases/download/v119.0.2/chromium-v119.0.2-pack.tar`
        );

        const browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        const targetUrl = req.body.url || "https://www.google.com";
        
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
        const currentUrl = page.url();

        await browser.close();

        return res.status(200).json({
            screenshotUrl: `data:image/png;base64,${screenshot}`,
            url: currentUrl
        });

    } catch (error) {
        console.error("Vercel Runtime Error:", error);
        return res.status(500).json({ error: "Chromium Error: " + error.message });
    }
}
