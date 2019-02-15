#!/usr/bin/env node
const https = require("https");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const util = require("util");
const prompts = require("prompts");
const axios = require("axios");

const q = text => new Promise(resolve => rl.question(text, resolve));
const existsP = util.promisify(fs.exists);
const readFileP = util.promisify(fs.readFile);
const appendFileP = util.promisify(fs.appendFile);
const writeFileP = util.promisify(fs.writeFile);

const outputFilePath = path.resolve(".npmrc");
const configFilePath = path.resolve(".npmartrc");

const main = async () => {
  let config = {};
  const configExists = await existsP(configFilePath);
  if (configExists) {
    const configFile = await readFileP(
      path.resolve(process.cwd(), ".npmartrc")
    );
    try {
      config = JSON.parse(configFile.toString());
    } catch (e) {
      console.warn("Could not read config: ", e);
    }
  }
  let finalConfig;
  try {
    finalConfig = await prompts([
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
        initial: config.registries ? config.registries.join(",") : "",
        type: "list",
        message: "Enter registries",
        validate: value =>
          /^@[\w-_]+=>[\w-_]+/.test(value) ||
          "Invalid format. Values must be @<scope>=><repo>. Eg, @fss/ip-wfss-npm-virtual"
      },
      {
        name: "useApiKey",
        initial: true,
        active: "yes",
        inactive: "no",
        type: "toggle",
        message: "Use API Key instead. Will create it if it doesn't exist."
      }
    ]);
  } catch (e) {
    console.log("Aborting due to:", e);
    return;
  }

  const options = {
    baseURL: `https://${finalConfig.hostname}/artifactory/api/`,
    path: "/artifactory/api/npm/auth",
    auth: {
      username: finalConfig.email,
      password: finalConfig.password
    }
  };
  const axiosInstance = axios.create(options);

  if (finalConfig.useApiKey) {
    try {
      // let's try to get an existing apikey
      const requestResult = await axiosInstance.get("security/apiKey");
      options.auth.password = requestResult.data.apiKey;
    } catch (e) {
      console.log("Failed to get apiKey, attempting to create apiKey...");
      try {
        // try to create it
        const requestResult = await axiosInstance.post("security/apiKey");
        options.auth.password = requestResult.data.apiKey;
      } catch (e) {
        // if this also fails, we'll fall back on using the provided password
        console.log(
          "Failed to create apiKey, defaulting to provided password."
        );
      }
    }
  }

  const npmrcExists = await existsP(outputFilePath);

  const npmGeneralAuth = await axiosInstance.get("npm/auth", {
    responseType: "text"
  });
  const _authString = npmGeneralAuth.data.slice(
    npmGeneralAuth.data.indexOf("_auth"),
    npmGeneralAuth.data.indexOf("\n")
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

    const fssSpecificAuth = await axiosInstance.get(
      `npm/${repo}/auth/${aliasWithoutAt}`,
      {
        responseType: "text"
      }
    );

    const registryRegExp = new RegExp(`^${alias}:registry\s*=.*\$`, "gm");

    const credsRegExp = new RegExp(
      `^\/\/${finalConfig.hostname}:443/artifactory/api/npm/${repo}/:.*\$`,
      "gm"
    );
    // Delete registry
    finalResult = finalResult.replace(registryRegExp, "");
    // Delete auth lines
    finalResult = finalResult.replace(credsRegExp, "");
    // Add in new auth lines
    finalResult = `${finalResult}\n${fssSpecificAuth.data}\n`;
  }

  finalResult = finalResult.replace(/\n\s*\n/g, "\n");
  await writeFileP(outputFilePath, finalResult);

  console.log("Success!");
  process.exit(0);
};

main();
