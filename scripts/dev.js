import "dotenv/config";
import { runDev } from "./dev/index.js";

runDev(process.argv.slice(2));
