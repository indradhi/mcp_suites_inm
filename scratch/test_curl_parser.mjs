import { parseCurl } from '../services/backoffice_ui/src/utils/curlParser.js';

const curlCmd = `curl --location 'http://172.18.20.5:4013/api/ebdesk/v.1.0.0/ktp' \\
--header 'Content-Type: application/json' \\
--data '{ "NIK": "",
  "NO_KK":"",
  "NAMA": "IWAN FALS",
  "START_TGL_LHR": "",
  "FINISH_TGL_LHR": "",
  "START_ROW": 1,
  "FINISH_ROW": 500
}'`;

console.log("Parsing test curl...");
const res = parseCurl(curlCmd);
console.log(JSON.stringify(res, null, 2));
