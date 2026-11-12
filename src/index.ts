import { createApp } from './app';

const port = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
