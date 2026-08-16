import { execSync } from 'child_process'
import * as fs from 'fs'
import path from 'path'

/**
 * Utility to execute shell commands with inherited stdio for real-time feedback
 */
const exec = (cmd: string, cwd?: string) => {
    console.log(`🚀 Executing: ${cmd}`);
    try {
        execSync(cmd, { stdio: 'inherit', cwd });
    } catch (err) {
        console.error(`❌ Execution failed for command: ${cmd}`);
        process.exit(1);
    }
};

async function runSetup() {
    // 1. Parameter Initialization
    // Arguments are passed from the command line: [projectName, appDisplayName, appId]
    const args = process.argv.slice(2);
    const projectName = args[0]; 
    const appDisplayName = args[1];
    const appId = args[2];

    console.log(`--- Starting environment setup for: ${projectName} ---`);

    // 2. Frontend Creation (Vite)
    // Using --template react-ts to skip interactive prompts and define the stack immediately
    exec(`npm create vite@latest ${projectName} -- --template react-ts`);

    const projectPath = path.join(process.cwd(), projectName);

    // 3. Frontend Dependencies
    // Navigating into the newly created project folder to install necessary libraries
    console.log('\n--- Installing Frontend Dependencies ---');
    exec('npm install', projectPath);
    exec('npm install react-router-dom zustand axios socket.io-client', projectPath);
    exec('npm install -D sass eslint-plugin-jsx-a11y @types/react-router-dom', projectPath);

    // 4. Backend Setup
    // Creating a dedicated 'server' directory within the project root for the Express backend
    console.log('\n--- Setting up Backend (Express) ---');
    const serverPath = path.join(projectPath, 'server');
    if (!fs.existsSync(serverPath)) fs.mkdirSync(serverPath);
    
    exec('npm init --yes', serverPath);
    
    // Applying ESM (ECMAScript Modules) support to the backend package.json
    const pkgPath = path.join(serverPath, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.type = 'module';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    exec('npm install express cors cookie-parser cryptr bcrypt dotenv mongodb socket.io nodemailer', serverPath);

    // 5. Mobile Integration (Capacitor)
    // Initializing mobile support. Note: 'npm run build' is required as Capacitor looks for a web-dir
    console.log('\n--- Configuring Capacitor for Mobile Deployment ---');
    exec('npm install @capacitor/core @capacitor/cli @capacitor/android', projectPath);
    exec('npm run build', projectPath); 
    exec(`npx cap init "${appDisplayName}" ${appId} --web-dir dist`, projectPath);
    exec('npx cap add android', projectPath);

    console.log(`\n✅ Setup Complete! Project created at: ${projectPath}`);
    console.log(`To start your frontend: cd ${projectName} && npm run dev`);
    console.log(`To start your backend: cd ${projectName}/server && node index.js`);
}

runSetup();