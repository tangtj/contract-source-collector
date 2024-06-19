import Web3 from "web3";
import fetch from 'node-fetch';
import {config} from "../config/config.js";
import fs from "fs";

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

        const r = Array.from(new Set(block.transactions.filter(v => {
            return v.input.length > 2 && v.to !== null
        }).map(v => {
            return v.to
        }))).filter(i => {
            const prefix = i.substring(0, 6).toLowerCase()
            return !fs.existsSync(`${config.path}/${prefix}/${i}`)
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

                let codeStr;
                const address = v;

                let sourceCode = code.SourceCode.trimLeft().trimRight();


                if (sourceCode.startsWith("{{") && sourceCode.endsWith("}}")) {
                    sourceCode = sourceCode.substring(1, sourceCode.length - 1)
                    const obj = JSON.parse(sourceCode);
                    if (obj?.sources) {
                        let code = "";
                        const files = obj?.sources;
                        for (let key in files) {
                            code = `${code}\n// File: ${key}\n${files[key]["content"]}\n`;
                        }
                        codeStr = code;
                    }
                } else {
                    codeStr = sourceCode;
                }

                const prefix = address.substring(0, 6).toLowerCase()
                if (!fs.existsSync(`${config.path}/${prefix}`)) {
                    fs.mkdirSync(`${config.path}/${prefix}`)
                }
                fs.writeFileSync(`${config.path}/${prefix}/${address}`, codeStr, (err) => {
                    console.log(err)
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