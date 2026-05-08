require("dotenv/config");
const { runDev } = require("./dev/index");

runDev(process.argv.slice(2));
