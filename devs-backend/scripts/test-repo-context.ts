/**
 * Test script to verify enhanced repository context from Qdrant
 *
 * Usage:
 *   pnpm tsx scripts/test-repo-context.ts <projectId>
 */

import { repositoryAnalyzerService } from '../src/services/repo-analyzer.service';
import { prisma } from '../src/lib/prisma';

async function testRepoContext() {
  const projectId = process.argv[2];

  if (!projectId) {
    console.error('❌ Please provide a project ID');
    console.log('Usage: pnpm tsx scripts/test-repo-context.ts <projectId>');
    process.exit(1);
  }

  console.log('\n🔍 Testing Enhanced Repository Context Retrieval\n');
  console.log('='.repeat(70));

  try {
    // 1. Check project and analysis status
    console.log(`\n1️⃣ Checking project analysis status...`);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        repositoryUrl: true,
        repoAnalysisStatus: true,
        repoFilesIndexed: true,
        repoEmbeddingsCount: true,
      },
    });

    if (!project) {
      console.error('❌ Project not found');
      process.exit(1);
    }

    console.log(`✅ Project: "${project.title}"`);
    console.log(`   - Repository: ${project.repositoryUrl || 'None'}`);
    console.log(`   - Analysis Status: ${project.repoAnalysisStatus || 'NOT_STARTED'}`);
    console.log(`   - Files Indexed: ${project.repoFilesIndexed || 0}`);
    console.log(`   - Embeddings: ${project.repoEmbeddingsCount || 0}`);

    if (
      project.repoAnalysisStatus !== 'COMPLETED' ||
      !project.repoEmbeddingsCount ||
      project.repoEmbeddingsCount === 0
    ) {
      console.log('\n⚠️  Repository not analyzed yet!');
      console.log('\n📋 To analyze the repository:');
      console.log('   1. Go to your project page');
      console.log('   2. Click "Analyze Repository"');
      console.log('   3. Wait for analysis to complete');
      console.log('   4. Run this script again');
      process.exit(0);
    }

    // 2. Test context retrieval with different queries
    console.log(`\n2️⃣ Retrieving comprehensive repository context...`);

    const queries = [
      {
        name: 'General Overview',
        query: 'project structure architecture components services',
        limit: 15,
      },
      {
        name: 'Authentication Focus',
        query: 'authentication authorization login user management',
        limit: 10,
      },
      {
        name: 'API & Routes',
        query: 'api routes controllers endpoints handlers',
        limit: 10,
      },
    ];

    for (const { name, query, limit } of queries) {
      console.log(`\n   📊 Query: ${name}`);
      console.log(`   🔎 Search: "${query}"`);

      const context = await repositoryAnalyzerService.getRepositoryContext(projectId, query, limit);

      console.log(`   ✅ Retrieved context successfully`);
      console.log(`      - Files: ${context.files.length}`);
      console.log(`      - Architecture: ${context.architecture}`);
      console.log(
        `      - Technologies: ${context.technologies.slice(0, 8).join(', ')}${context.technologies.length > 8 ? '...' : ''}`
      );
      console.log(`      - Patterns: ${context.keyPatterns.join(', ')}`);

      if (name === 'General Overview') {
        // Show detailed overview for first query
        console.log(`\n   📋 Repository Overview:`);
        console.log('   ' + '-'.repeat(66));
        console.log(
          context.overview
            .split('\n')
            .map((line) => '   ' + line)
            .join('\n')
        );
        console.log('   ' + '-'.repeat(66));

        console.log(`\n   📁 Top ${Math.min(5, context.files.length)} Files:`);
        context.files.slice(0, 5).forEach((file, i) => {
          console.log(`\n   ${i + 1}. **${file.path}** (${file.language})`);
          console.log(`      Purpose: ${file.purpose}`);
          console.log(`      Complexity: ${file.complexity}`);
          if (file.exports && file.exports.length > 0) {
            console.log(
              `      Exports: ${file.exports.slice(0, 5).join(', ')}${file.exports.length > 5 ? '...' : ''}`
            );
          }
          if (file.dependencies && file.dependencies.length > 0) {
            console.log(
              `      Dependencies: ${file.dependencies.slice(0, 5).join(', ')}${file.dependencies.length > 5 ? '...' : ''}`
            );
          }
          if (file.summary) {
            console.log(
              `      Summary: ${file.summary.substring(0, 150)}${file.summary.length > 150 ? '...' : ''}`
            );
          }
        });
      }
    }

    // 3. Summary
    console.log('\n' + '='.repeat(70));
    console.log('\n✅ Repository Context Test Complete!\n');
    console.log('Summary:');
    console.log(`  • Project: "${project.title}"`);
    console.log(`  • Embeddings: ${project.repoEmbeddingsCount} code chunks indexed`);
    console.log(`  • Files: ${project.repoFilesIndexed} analyzed`);
    console.log(`  • Status: Context retrieval working ✓`);

    console.log('\n📊 Next Steps:');
    console.log('  1. Go to your project chat');
    console.log('  2. Send: "Generate comprehensive milestones for this project"');
    console.log('  3. AI will use this detailed context to generate accurate milestones');
    console.log('  4. Verify milestones reference actual file paths and patterns\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testRepoContext();
