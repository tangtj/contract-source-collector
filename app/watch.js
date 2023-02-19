import Web3 from "web3";
import fetch from 'node-fetch';
import crypto from 'crypto';
import pg from 'pg'
import {config} from "../config/config.js";


const pool = new pg.Pool({
    ...config.db, max: 20, connectionTimeoutMillis: 2000,
})
export default async function watch() {

    const web3 = new Web3(config.rpc);


    const eth = web3.eth;
    eth.subscribe("newBlockHeaders", async (error, header) => {
        if (error) {
            console.error("sub new block header error", error)
            return
        }

        const block = await eth.getBlock(header.number, true).catch(e => {
            console.error("query block error", e)
            return undefined;
        })

        if (!block || !block.transactions || block.transactions?.length <= 0) {
            return
        }

        const address = Array.from(new Set(block.transactions.filter(v => {
            return v.input.length > 2
        }).map(v => {
            return v.to
        })))
        const result = await pool.query(`select * from (select unnest($1::text[]) as addr) as addrs where addr not in (select address as addr from source)`, [address])

        const r = result.rows?.map((v) => {
            return v.addr
        })

        for (const v of r) {
            const resp = await fetch(`${config.api.url}?module=contract&action=getsourcecode&address=${v}&apikey=${getRdApikey()}`).catch(e => {
                console.error("request api error", e)
                return undefined;
            })
            if (!resp) {
                continue;
            }
            const r = await resp.json()
            if (r.message === 'OK' && r.result[0]?.SourceCode?.length > 0) {
                const code = r.result[0]
                const address = v;
                pool.query({
                    name: "save-contract-code",
                    text: `insert into source(address,source,md5) values($1,$2,$3) ON CONFLICT DO NOTHING`,
                    values: [address, code.SourceCode, crypto.createHash('md5').update(code.SourceCode).digest("hex")]
                })
            }
        }
    }).on("error", (error) => {
        console.error("sub new block header error", error);
        process.exit(1);
    })
}

function getRdApikey() {
    const r = config.api.key[Math.floor(Math.random() * (config.api.key.length - 1))];
    return r
}