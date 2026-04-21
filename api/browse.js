import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        // تحميل النسخة التي تحتوي على كافة المكتبات المفقودة من رابط خارجي
        const executablePath = await chromium.executablePath(
            `https://github.com/sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar`
        );

        const browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        const targetUrl = req.body.url || "https://www.google.com";
        
        // تقليل وقت الانتظار لتجنب توقف Vercel (Timeout)
        await page.goto(targetUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 12000 
        });

        const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
        const finalUrl = page.url();

        await browser.close();

        return res.status(200).json({
            screenshotUrl: `data:image/png;base64,${screenshot}`,
            url: finalUrl
        });

    } catch (error) {
        console.error("Vercel Final Fix Error:", error);
        return res.status(500).json({ error: "Chromium Fix Failed: " + error.message });
    }
}
