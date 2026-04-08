const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://frontend/';
const FOLDER_PATH = process.env.FOLDER_PATH || '/tests/test_files';
const RESULTS_DIR = process.env.RESULTS_DIR || '/tests/results';
const OUTPUT_JSON_PATH = path.resolve(RESULTS_DIR, 'automatic_testResults.json');

const WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const UI_READY_TIMEOUT_MS = 15 * 60 * 1000;
const SLOW_POLL_MS = 1000;
const REPEAT_UPLOADS_PER_FILE = 15;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getFilesSequential(folderPath, allowedExtensions) {
  return fs
    .readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => allowedExtensions.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => path.join(folderPath, name));
}

async function waitForUiReady(page) {
  await page.goto(BASE_URL, {
    waitUntil: 'load',
    timeout: UI_READY_TIMEOUT_MS,
  });

  const sidebar = page.getByTestId('sidebar');
  const zipSection = page.getByTestId('upload-zip-section');
  const fileInput = page.getByTestId('upload-zip-file-input');
  const uploadButton = page.getByTestId('upload-zip-upload-button');
  const fileNameBox = page.getByTestId('upload-zip-file-name');

  await expect(sidebar).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
  await expect(zipSection).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });

  await expect(fileInput).toBeAttached({ timeout: UI_READY_TIMEOUT_MS });
  await expect(fileInput).toHaveAttribute('type', 'file', {
    timeout: UI_READY_TIMEOUT_MS,
  });
  await expect(fileInput).not.toBeDisabled({ timeout: UI_READY_TIMEOUT_MS });

  await expect(uploadButton).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
  await expect(uploadButton).toBeEnabled({ timeout: UI_READY_TIMEOUT_MS });

  await expect(fileNameBox).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });

  await page.waitForFunction(
    () => {
      const state = window.__uploadTestState;
      if (!state) return true;
      return state.uploadInProgress === false;
    },
    null,
    {
      timeout: UI_READY_TIMEOUT_MS,
      polling: SLOW_POLL_MS,
    }
  );

  return { fileInput, uploadButton, fileNameBox };
}

async function waitForUploadControlsReady(fileInput, uploadButton, fileNameBox) {
  await expect(fileInput).toBeAttached({ timeout: UI_READY_TIMEOUT_MS });
  await expect(fileInput).toHaveAttribute('type', 'file', {
    timeout: UI_READY_TIMEOUT_MS,
  });
  await expect(fileInput).not.toBeDisabled({ timeout: UI_READY_TIMEOUT_MS });

  await expect(uploadButton).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
  await expect(uploadButton).toBeEnabled({ timeout: UI_READY_TIMEOUT_MS });

  await expect(fileNameBox).toBeVisible({ timeout: UI_READY_TIMEOUT_MS });
}

async function selectFileAndWaitForReact(page, fileInput, fileNameBox, fullPath) {
  const fileName = path.basename(fullPath);

  await fileInput.setInputFiles(fullPath, {
    timeout: UI_READY_TIMEOUT_MS,
  });

  await expect(fileNameBox).toHaveText(fileName, {
    timeout: UI_READY_TIMEOUT_MS,
  });

  await page.waitForFunction(
    ({ inputTestId, expectedName }) => {
      const input = document.querySelector(`[data-testid="${inputTestId}"]`);
      if (!input || input.tagName !== 'INPUT') return false;
      const files = input.files;
      return !!files && files.length === 1 && files[0]?.name === expectedName;
    },
    {
      inputTestId: 'upload-zip-file-input',
      expectedName: fileName,
    },
    {
      timeout: UI_READY_TIMEOUT_MS,
      polling: SLOW_POLL_MS,
    }
  );

  return fileName;
}

async function triggerUpload(uploadButton) {
  await uploadButton.dispatchEvent('click');
}

test.describe('Sequential bulk upload using app perf capture', () => {
  test.setTimeout(0);

  test('uploads all files 15 times each and saves perf json efficiently', async ({ page }) => {
    ensureDir(RESULTS_DIR);

    page.setDefaultTimeout(UI_READY_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(UI_READY_TIMEOUT_MS);

    await page.route('**/*', async (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        await route.abort();
        return;
      }
      await route.continue();
    });

    const files = getFilesSequential(FOLDER_PATH, ['.zip']);
    console.log('Files found:', files);
    if (!files.length) {
      throw new Error(`No zip files found in: ${FOLDER_PATH}`);
    }

    const { fileInput, uploadButton, fileNameBox } = await waitForUiReady(page);

    await page.keyboard.press('Shift+M');

    for (const fullPath of files) {
      for (let attempt = 1; attempt <= REPEAT_UPLOADS_PER_FILE; attempt++) {
        await waitForUploadControlsReady(fileInput, uploadButton, fileNameBox);

        const fileName = await selectFileAndWaitForReact(
          page,
          fileInput,
          fileNameBox,
          fullPath
        );

        await triggerUpload(uploadButton);

await page.waitForFunction(
  (expectedFile) =>
    window.__uploadTestState &&
    window.__uploadTestState.uploadInProgress === false &&
    window.__uploadTestState.lastCompletedFile === expectedFile,
  fileName,
  {
    timeout: 0,
    polling: SLOW_POLL_MS,
  }
);
      }
    }

await page.waitForFunction(
  () => {
    const state = window.__uploadTestState;
    if (!state) return true;
    return state.uploadInProgress === false;
  },
  null,
  {
    timeout: 0,
    polling: SLOW_POLL_MS,
  }
);

await page.waitForTimeout(30_000); //letzter upload macht sonst probleme und taucht nicht auf

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: UI_READY_TIMEOUT_MS }),
      page.keyboard.press('Shift+P'),
    ]);

    await download.saveAs(OUTPUT_JSON_PATH);
  });
});