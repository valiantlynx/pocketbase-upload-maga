// this uses puppeteer to scrape the website, the problem is that puppeter needs chromium to be installed to run.
// turn imports into module imports
import { setupPuppeteer } from './puppeteer.mjs';
import { url } from './setupPocketbase.mjs';
import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import axios from 'axios';
import cheerio from 'cheerio';
import { create } from 'ipfs-http-client';
import { storeData } from './storeData.mjs';


dotenv.config();
const ipfs = create()
const app = express();

const port = process.env.SCRAPE_API_PORT;
const hostURL = process.env.HOST_URL

app.use(cors());

const baseURL = "https://mangapark.net/";

app.get('/', async (req, res) => {
    const page = req.query.page || 100;

    const resultList = await axios.get(`${url}/api/collections/manga/records?page=${page}`, {
        headers: {
            'Content-Type': 'application/json',
        },
    })
        .then((res) => {
            return res.data;
        })
        .catch((error) => {
            console.error("error: ", error.message);
        });

    // send pocketbase data
    res.send(resultList);
});

app.get('/ipfs/:cid', async (req, res) => {
    const cid = req.params.cid;

    try {
        const chunks = [];
        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        const data = Buffer.concat(chunks);

        // Set the appropriate content type for the image
        res.set('Content-Type', 'image/png');

        // Process the data or send it as a response
        res.send(data);
    } catch (error) {
        console.error('Error retrieving IPFS data:', error);
        res.status(500).send('Error retrieving IPFS data');
    }
});

app.get('/api/browse/:page', async (req, res) => {
    let pageNo = req.params.page;

    try {
        console.log('currently on page', pageNo);

        const url = `${baseURL}browse?page=${pageNo}`;
        const response = await axios.get(url).catch((err) => {
            console.log("error: ", err.message);
        });
        const $ = cheerio.load(response.data);

        const scrapedData = [];

        $('.pb-3').each((index, element) => {
            const titleElement = $(element).find('.fw-bold');
            const imgElement = $(element).find('img');
            const tagsElement = $(element).find('.genres');
            const chaptersElement = $(element).find('.text-ellipsis-1');
            const srcElement = $(element).find('a');
            const descriptionElement = $(element).find('.limit-html');
            const authorElement = $(element).find('.autarts');

            // Extract the ID and title ID from the src URL
            const src = srcElement.attr('href');
            const id = src ? src.split('/').slice(-2, -1)[0] : null;
            const titleId = src ? src.split('/').slice(-1)[0] : null;

            const content = {
                title: titleElement.text().trim(),
                img: imgElement.attr('src'),
                tags: tagsElement.text(),
                latestChapter: chaptersElement.text(),
                src,
                id,
                titleId,
                description: descriptionElement.text(),
                author: authorElement.length
                    ? [authorElement.text(), authorElement.find('a').attr('href')]
                    : null,
            };

            scrapedData.push(content);
        });

        storeData(scrapedData);

        res.json({
            page: pageNo,
            mangas: scrapedData,
          
        });

    } catch (error) {
        console.error('Scraping failed', error.message);
        res.status(500).json({
            error: error.message,
            failure: error
        });
    }
});


app.listen(port, () => console.log(`running on ${port}`));
