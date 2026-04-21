// استخدام import بدلاً من require لحل مشكلة ES Module
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    // إعداد الرؤوس (Headers) للسماح لروبلوكس بالوصول
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        
        // التأكد من استلام الرابط من روبلوكس
        const targetUrl = req.body.url || "https://www.google.com";
        
        // محاولة فتح الموقع مع وقت انتظار 20 ثانية
        await page.goto(targetUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 20000 
        });

        const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
        const currentUrl = page.url();
        const title = await page.title();

        await browser.close();

        return res.status(200).json({
            screenshotUrl: `data:image/png;base64,${screenshot}`,
            url: currentUrl,
            title: title
        });

    } catch (error) {
        console.error("Vercel Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
