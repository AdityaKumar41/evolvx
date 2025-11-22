/**
 * Test script to verify PRD/document processing for milestone generation
 *
 * Usage:
 *   pnpm tsx scripts/test-document-processing.ts <projectId>
 */

import { prisma } from '../src/lib/prisma';
import { documentService } from '../src/services/document.service';

async function testDocumentProcessing() {
  const projectId = process.argv[2];

  if (!projectId) {
    console.error('❌ Please provide a project ID');
    console.log('Usage: pnpm tsx scripts/test-document-processing.ts <projectId>');
    process.exit(1);
  }

  console.log('\n🔍 Testing Document Processing for Milestone Generation\n');
  console.log('='.repeat(60));

  try {
    // 1. Fetch project
    console.log(`\n1️⃣ Fetching project: ${projectId}`);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        milestones: true,
      },
    });

    if (!project) {
      console.error('❌ Project not found');
      process.exit(1);
    }

    console.log(`✅ Project found: "${project.title}"`);
    console.log(`   - Description: ${project.description?.substring(0, 100)}...`);
    console.log(`   - Repository: ${project.repositoryUrl || 'None'}`);
    console.log(`   - Existing milestones: ${project.milestones.length}`);

    // 2. Fetch project-level documents
    console.log(`\n2️⃣ Fetching project documents...`);
    const documents = await prisma.document.findMany({
      where: {
        projectId,
        milestoneId: null, // Only project-level documents
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`✅ Found ${documents.length} project-level document(s)`);

    if (documents.length === 0) {
      console.log('\n⚠️  No documents uploaded to this project!');
      console.log('\n📋 To upload a document:');
      console.log('   1. Go to your project page in the frontend');
      console.log('   2. Click "Upload Document"');
      console.log('   3. Upload your PRD.md or requirements.txt file');
      console.log('   4. Run this script again');
      process.exit(0);
    }

    // 3. Test document content extraction
    console.log(`\n3️⃣ Testing document content extraction...`);
    const documentUrls = documents.map((doc) => doc.fileUrl);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(`\n   Document ${i + 1}: ${doc.fileName}`);
      console.log(`   - File Type: ${doc.fileType}`);
      console.log(`   - Size: ${(doc.fileSizeBytes / 1024).toFixed(2)} KB`);
      console.log(`   - S3 Key: ${doc.fileUrl}`);
      console.log(`   - Uploaded: ${doc.createdAt.toISOString()}`);

      try {
        console.log(`   - Extracting content...`);
        const content = await documentService.getDocumentContent(doc.fileUrl);

        if (content && content.length > 0) {
          console.log(`   ✅ Extracted ${content.length} characters`);
          console.log(`   - Preview: ${content.substring(0, 150).replace(/\n/g, ' ')}...`);
        } else {
          console.log(`   ⚠️  Content is empty (may not be supported format)`);
          if (doc.fileType.includes('pdf')) {
            console.log(`   💡 Note: PDF parsing is not yet implemented`);
          }
        }
      } catch (error) {
        console.error(`   ❌ Failed to extract content:`, error);
      }
    }

    // 4. Simulate milestone generation context
    console.log(`\n4️⃣ Simulating milestone generation context...`);
    console.log('\nContext that would be passed to Inngest:');
    console.log(
      JSON.stringify(
        {
          projectId,
          prompt: 'Generate milestones for this project',
          projectTitle: project.title,
          projectDescription: project.description || '',
          documentUrls: documentUrls,
          repositoryUrl: project.repositoryUrl || undefined,
          existingMilestonesCount: project.milestones.length,
        },
        null,
        2
      )
    );

    // 5. Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Document Processing Test Complete!\n');
    console.log('Summary:');
    console.log(`  • Project: "${project.title}"`);
    console.log(`  • Documents: ${documents.length} file(s)`);
    console.log(
      `  • Total size: ${(documents.reduce((sum, d) => sum + d.fileSizeBytes, 0) / 1024).toFixed(2)} KB`
    );
    console.log(`  • Repository: ${project.repositoryUrl ? 'Yes' : 'No'}`);
    console.log(`  • Existing milestones: ${project.milestones.length}`);

    console.log('\n📊 Next Steps:');
    console.log('  1. Go to your project chat');
    console.log('  2. Send: "Generate milestones for this project"');
    console.log('  3. Watch backend logs for document processing:');
    console.log('     - "Processing documents { count: N }"');
    console.log('     - "Successfully extracted X characters"');
    console.log('     - "Analyzing documents with GPT-4o"');
    console.log('  4. Verify generated milestones match your PRD\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDocumentProcessing();
