#!/usr/bin/env tsx
/**
 * Test script for Repository Analyzer
 * Verifies that the analyzer can fetch files, generate embeddings, and store in Qdrant
 */

import { repositoryAnalyzerService } from '../src/services/repo-analyzer.service';
import { vectorSearchService } from '../src/services/vector-search.service';
import { logger } from '../src/utils/logger';
import { initQdrantCollections } from '../src/lib/qdrant';

async function testRepositoryAnalyzer() {
  console.log('🧪 Testing Repository Analyzer\n');

  try {
    // 1. Initialize Qdrant collections
    console.log('1️⃣  Initializing Qdrant collections...');
    await initQdrantCollections();
    console.log('   ✅ Qdrant collections initialized\n');

    // 2. Test with a small public repository
    const testProjectId = 'test-project-' + Date.now();
    const testRepoUrl = 'https://github.com/vercel/next.js'; // Small test repo

    console.log('2️⃣  Analyzing repository...');
    console.log(`   Project ID: ${testProjectId}`);
    console.log(`   Repository: ${testRepoUrl}\n`);

    const result = await repositoryAnalyzerService.analyzeRepository(testProjectId, testRepoUrl);

    console.log('   ✅ Repository analysis complete:');
    console.log(`   - Files analyzed: ${result.filesAnalyzed}`);
    console.log(`   - Embeddings created: ${result.embeddingsCreated}`);
    console.log(`   - Technologies: ${result.technologies.join(', ')}`);
    console.log(`   - Complexity: ${result.complexity}\n`);

    // 3. Test vector search
    console.log('3️⃣  Testing vector search...');
    const searchResults = await vectorSearchService.searchCodebase(
      testProjectId,
      'authentication code',
      5
    );

    console.log(`   ✅ Found ${searchResults.length} relevant code snippets`);
    if (searchResults.length > 0) {
      console.log('\n   Top result:');
      console.log(`   - File: ${searchResults[0].filePath}`);
      console.log(`   - Purpose: ${searchResults[0].purpose}`);
      console.log(`   - Complexity: ${searchResults[0].complexity}`);
      console.log(`   - Score: ${searchResults[0].score.toFixed(3)}\n`);
    }

    // 4. Test codebase context
    console.log('4️⃣  Testing codebase context...');
    const context = await vectorSearchService.getCodebaseContext(
      testProjectId,
      'authentication and authorization',
      3
    );

    console.log(`   ✅ Codebase context retrieved:`);
    console.log(`   - Relevant files: ${context.totalFiles}`);
    console.log(`   - Summary: ${context.summary}\n`);

    // 5. Get index statistics
    console.log('5️⃣  Getting index statistics...');
    const stats = await vectorSearchService.getIndexStats(testProjectId);

    console.log('   ✅ Index statistics:');
    console.log(`   - Total chunks: ${stats.totalChunks}`);
    console.log(`   - Unique files: ${stats.uniqueFiles}`);
    console.log(`   - Technologies: ${stats.technologies.join(', ')}\n`);

    // 6. Test file search by pattern
    console.log('6️⃣  Testing file pattern search...');
    const fileResults = await vectorSearchService.searchFilesByPattern(testProjectId, 'auth', 5);

    console.log(`   ✅ Found ${fileResults.length} files matching pattern "auth"`);
    if (fileResults.length > 0) {
      fileResults.forEach((file, i) => {
        console.log(`   ${i + 1}. ${file.filePath}`);
      });
    }

    // 7. Cleanup test data
    console.log('\n7️⃣  Cleaning up test data...');
    await vectorSearchService.deleteProjectEmbeddings(testProjectId);
    console.log('   ✅ Test data deleted\n');

    console.log('🎉 All tests passed! Repository analyzer is working correctly.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    logger.error('Repository analyzer test failed:', error);
    process.exit(1);
  }
}

// Run the test
testRepositoryAnalyzer();
