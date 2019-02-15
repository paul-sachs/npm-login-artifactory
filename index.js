#!/usr/bin/env node

const https = require("https");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const util = require("util");
const prompts = require("prompts");

const q = text => new Promise(resolve => rl.question(text, resolve));
const existsP = util.promisify(fs.exists);
const readFileP = util.promisify(fs.readFile);
const appendFileP = util.promisify(fs.appendFile);
const writeFileP = util.promisify(fs.writeFile);

const outputFilePath = path.resolve(".dump");
const configFilePath = path.resolve(".npmartrc");

const httpsGet = options =>
  new Promise((resolve, reject) => {
    https
      .get(options, resp => {
        let data = "";

        // A chunk of data has been recieved.
        resp.on("data", chunk => {
          data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on("end", () => {
          resolve(data);
        });
      })
      .on("error", err => {
        reject(err);
      });
  });

const main = async () => {
  let config = {};
  const configExists = await existsP(configFilePath);
  if (configExists) {
    const configFile = await readFileP(
      path.resolve(process.cwd(), ".npmartrc")
    );
    config = JSON.parse(configFile.toString());
  }

  const finalConfig = await prompts([
    {
      name: "email",
      initial: config.email,
      type: "text", //() => (config.email ? null : "text"),
      message: "Enter your intranet email",
      validate: i => !!i
    },
    {
      name: "password",
      initial: config.password,
      type: "invisible", //() => (config.password ? null : "invisible"),
      message: "Enter your intranet password",
      validate: i => !!i
    },
    {
      name: "hostname",
      initial: config.hostname,
      type: "text", //() => (config.hostname ? null : "text",
      message: "Artifactory hostname",
      validate: i => !!i
    },
    {
      name: "registries",
      initial: config.registries.join(","),
      type: "list",
      message: "Enter registries",
      validate: value =>
        /^@[\w-_]+=>[\w-_]+/.test(value) ||
        "Invalid format. Values must be @<scope>=><repo>. Eg, @fss/ip-wfss-npm-virtual"
    }
  ]);

  const options = {
    hostname: finalConfig.hostname,
    port: 443,
    path: "/artifactory/api/npm/auth",
    method: "GET",
    headers: {
      Authorization: `Basic ${new Buffer(
        `${finalConfig.email}:${finalConfig.password}`
      ).toString("base64")}`
    }
  };

  const npmrcExists = await existsP(configFilePath);

  const npmGeneralAuth = await httpsGet(options);
  const _authString = npmGeneralAuth.slice(
    npmGeneralAuth.indexOf("_auth"),
    npmGeneralAuth.indexOf("\n")
  );

  let finalResult = "";
  if (npmrcExists) {
    const existingOutputFileContents = await readFileP(outputFilePath);
    finalResult = existingOutputFileContents.toString();
  }

  const authRegExp = /^_auth\s*=\s*\S*$/gm;
  if (authRegExp.test(finalResult)) {
    finalResult = finalResult.replace(authRegExp, _authString);
  } else {
    finalResult = `${finalResult}\n${_authString}`;
  }

  for (let i = 0; i < finalConfig.registries.length; i++) {
    const [alias, repo] = finalConfig.registries[i]
      .split("=>")
      .map(i => i.trim());
    const aliasWithoutAt = alias.slice(1);

    const fssSpecificAuth = await httpsGet({
      ...options,
      path: `/artifactory/api/npm/${repo}/auth/${aliasWithoutAt}`
    });

    const registryRegExp = new RegExp(`^${alias}:registry\s*=.*\$`, 'gm');
    const credsRegExp = new RegExp(`^\/\/${options.hostname}:${options.port}/artifactory/api/npm/${repo}/:.*\$`, 'gm')
    // Delete registry
    finalResult = finalResult.replace(registryRegExp, '');
    // Delete auth lines
    finalResult = finalResult.replace(credsRegExp, '');
    // Add in new auth lines
    finalResult = `${finalResult}\n${fssSpecificAuth}\n`;
  }

  finalResult = finalResult.replace(/\n\s*\n/g, '\n');
  await writeFileP(outputFilePath, finalResult);

  console.log("Success!");
  process.exit(0);
};

main();
