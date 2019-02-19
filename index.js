#!/usr/bin/env node
const https = require("https");
const fs = require("fs");
const path = require("path");
const util = require("util");
const prompts = require("prompts");
const axios = require("axios");
const optimist = require("optimist");

const q = text => new Promise(resolve => rl.question(text, resolve));
const existsP = util.promisify(fs.exists);
const readFileP = util.promisify(fs.readFile);
const appendFileP = util.promisify(fs.appendFile);
const writeFileP = util.promisify(fs.writeFile);

const outputFilePath = path.resolve(".npmrc");
const configFilePath = path.resolve(".npmartrc");

const command = optimist
  .usage(
    "Customize your npm credentials to support artifactory.\nUsage: npm-login-artifactory"
  )
  .options("n", {
    alias: "hostname",
    describe: "Artifactory hostname. Eg: na.artifactory.swg-devops.com"
  })
  .options("r", {
    alias: "registries",
    describe:
      "Comma seperated list of registries to map namespaces to. Eg: @fss=>ip-wfss-npm-virtual"
  })
  .options("e", {
    alias: "email",
    describe: "Intranet email"
  })
  .options("p", {
    alias: "password",
    describe: "Intranet password"
  })
  .boolean("x")
  .options("x", {
    alias: "skipApiKey",
    describe: "Don't use api key for auth, just use password"
  })
  .boolean("q")
  .options("q", {
    describe: "Quiet mode"
  })
  .options("h", {
    alias: "help",
    describe: "Provide usage information"
  });

const argv = command.argv;

if (argv.h) {
  command.showHelp(console.log);
  return;
}

const consoleConfig = {
  hostname: argv.n,
  registries: argv.r ? argv.r.split(",") : [],
  email: argv.e,
  password: argv.p,
  useApiKey: !argv.x
};

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
  // Merge command line args with config file
  config = {
    ...consoleConfig,
    ...config
  };
  if (!argv.q) {
    try {
        config = await prompts([
        {
          name: "email",
          initial: config.email,
          type: "text",
          message: "Enter your intranet email",
          validate: i => !!i
        },
        {
          name: "password",
          initial: config.password,
          type: "invisible",
          message: "Enter your intranet password",
          validate: i => !!i
        },
        {
          name: "hostname",
          initial: config.hostname,
          type: "text",
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
          initial: config.useApiKey,
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
  } else {
      // validate that the config has everything we need
      const missingParams = ['hostname', 'registries', 'email', 'password'].filter(r => !config[r] || config[r].length === 0);
      if (missingParams.length > 0) {
          console.error(`Missing some required parameters: ${missingParams.join(', ')}`);
          command.showHelp();
          return;
      }
  }

  const options = {
    baseURL: `https://${config.hostname}/artifactory/api/`,
    path: "/artifactory/api/npm/auth",
    auth: {
      username: config.email,
      password: config.password
    }
  };
  const axiosInstance = axios.create(options);

  console.log(`Fetching general registry information...`);

  if (config.useApiKey) {
    try {
      // let's try to get an existing apikey
      console.log(`Fetching api key...`);
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

  for (let i = 0; i < config.registries.length; i++) {
    const [alias, repo] = config.registries[i]
      .split("=>")
      .map(i => i.trim());
    const aliasWithoutAt = alias.slice(1);

    console.log(`Fetching registry information for ${config.registries[i]}...`);
    const fssSpecificAuth = await axiosInstance.get(
      `npm/${repo}/auth/${aliasWithoutAt}`,
      {
        responseType: "text"
      }
    );

    const registryRegExp = new RegExp(`^${alias}:registry\s*=.*\$`, "gm");

    const credsRegExp = new RegExp(
      `^\/\/${config.hostname}:443/artifactory/api/npm/${repo}/:.*\$`,
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

  console.log(`Successfully wrote to ${outputFilePath}.`);
  process.exit(0);
};

main();
