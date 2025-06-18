### Run n8n using docker with puppeteer:

- Install the docker desktop
- Open the docker desktop
- build the docker image: `docker build -t n8n-puppeteer -f docker/Dockerfile docker/`
- run the docker image:
  ```
  docker run -it \
      -p 5678:5678 \
      -v ~/.n8n:/home/node/.n8n \
      n8n-puppeteer
  ```
- While working with the puppeteer node make sure to add the following option:

  - enable: `Add Container Arguments`

- Puppeteer script example:

```
// Navigate to url
await $page.goto('{{ $json.token_url }}', { waitUntil: 'domcontentloaded', timeout: 60000 });

// Fill input
await $page.waitForSelector('#upi-text', { timeout: 10000 });
await $page.type('#upi-text', '{{ $('Start').item.json.upi_id }}');

// Screenshot before submit
const beforeScreenshot = await $page.screenshot({
  type: 'png',
  fullPage: true,
  encoding: 'base64',
});


// Click the Submit button
await $page.waitForSelector('#submit-btn', { timeout: 10000 });
await $page.click('#submit-btn');

// Wait for first navigation (or timeout fallback)
try {
await $page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
}catch(e){
console.warn('First navigation timed out, continuing...');
}

// Take a screenshot
const afterScreenshot = await $page.screenshot({
  type: 'png',
  fullPage: true,
  encoding: 'base64',
});

// Second navigation
try {
await $page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 300000 });
}catch(e){
console.warn('Second navigation timed out, continuing...');
}

const afterSecondNavigation = await $page.screenshot({
  type: 'png',
  fullPage: true,
  encoding: 'base64',
});

// Wait for final buttons
await $page.waitForSelector('button[data-val="S"]', { timeout: 10000 });

// Click the button with data-val="S"
await $page.click('button[data-val="S"]');


// Third navigation
try {
await $page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
}catch(e){
console.warn('Third navigation timed out, continuing...');
}

const afterThirdNavigation = await $page.screenshot({
  type: 'png',
  fullPage: true,
  encoding: 'base64',
});

// Return all screenshots
return [
  {
    binary: {
      before: {
        data: beforeScreenshot,
        mimeType: "image/png",
        fileName: "before-submit.png",
      },
      after: {
        data: afterScreenshot,
        mimeType: "image/png",
        fileName: "after-submit.png",
      },
      after_second: {
        data: afterSecondNavigation,
        mimeType: "image/png",
        fileName: "after-second-navigation.png",
      },
      after_third: {
        data: afterThirdNavigation,
        mimeType: "image/png",
        fileName: "after-third-navigation.png",
      },
    },
  },
];
```
