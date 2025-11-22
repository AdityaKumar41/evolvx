import { DocumentParser } from '../src/utils/document-parser';
import fs from 'fs';
import path from 'path';

async function testDocumentParser() {
  console.log('🧪 Testing Document Parser\n');

  // Test 1: Parse markdown file
  console.log('📝 Test 1: Markdown file');
  const mdContent = `# Test PRD

## Overview
This is a test product requirements document.

## Features
- Feature 1: User authentication
- Feature 2: Dashboard
- Feature 3: API integration

## Technical Requirements
- React frontend
- Node.js backend
- PostgreSQL database
`;

  const mdBuffer = Buffer.from(mdContent, 'utf-8');
  try {
    const parsed = await DocumentParser.parseFile(mdBuffer, 'test.md');
    console.log('✅ Markdown parsed successfully');
    console.log(`Length: ${parsed.length} characters`);
    console.log(`Preview: ${parsed.substring(0, 100)}...\n`);
  } catch (error) {
    console.error('❌ Failed to parse markdown:', error);
  }

  // Test 2: Parse text file
  console.log('📄 Test 2: Text file');
  const txtContent = 'This is a simple text file with requirements.';
  const txtBuffer = Buffer.from(txtContent, 'utf-8');
  try {
    const parsed = await DocumentParser.parseFile(txtBuffer, 'test.txt');
    console.log('✅ Text parsed successfully');
    console.log(`Content: ${parsed}\n`);
  } catch (error) {
    console.error('❌ Failed to parse text:', error);
  }

  // Test 3: Base64 parsing
  console.log('🔐 Test 3: Base64 encoding');
  const base64 = Buffer.from('Test base64 content').toString('base64');
  try {
    const parsed = await DocumentParser.parseBase64File(base64, 'test.txt');
    console.log('✅ Base64 parsed successfully');
    console.log(`Content: ${parsed}\n`);
  } catch (error) {
    console.error('❌ Failed to parse base64:', error);
  }

  // Test 4: Base64 with data URL prefix
  console.log('🔗 Test 4: Base64 with data URL');
  const dataUrl = `data:text/plain;base64,${base64}`;
  try {
    const parsed = await DocumentParser.parseBase64File(dataUrl, 'test.txt');
    console.log('✅ Data URL parsed successfully');
    console.log(`Content: ${parsed}\n`);
  } catch (error) {
    console.error('❌ Failed to parse data URL:', error);
  }

  // If you have a sample PDF, test it
  const samplePdfPath = path.join(__dirname, 'sample.pdf');
  if (fs.existsSync(samplePdfPath)) {
    console.log('📕 Test 5: PDF file');
    try {
      const pdfBuffer = fs.readFileSync(samplePdfPath);
      const parsed = await DocumentParser.parseFile(pdfBuffer, 'sample.pdf');
      console.log('✅ PDF parsed successfully');
      console.log(`Length: ${parsed.length} characters`);
      console.log(`Preview: ${parsed.substring(0, 200)}...\n`);
    } catch (error) {
      console.error('❌ Failed to parse PDF:', error);
    }
  }

  console.log('✨ All tests completed!');
}

// Run tests
testDocumentParser().catch(console.error);
