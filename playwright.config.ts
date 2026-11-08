import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'**/*.browser.ts',workers:1,use:{baseURL:'http://127.0.0.1:4173',channel:'chrome',viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:2.625},webServer:{command:'node e2e/serve-static.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:false}});
