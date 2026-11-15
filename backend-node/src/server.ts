import { app } from './app.js';

const rawPort = process.env.PORT ?? '3000';
const port = Number(rawPort);
if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
app.listen(port, () => {
  console.log(`GoodLook API listening on port ${port}`);
});
