import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from './logger';

/**
 * Parse document content based on file type
 */
export class DocumentParser {
  /**
   * Parse a PDF file buffer to text
   */
  static async parsePDF(buffer: Buffer): Promise<string> {
    try {
      // @ts-expect-error - pdf-parse has incorrect type definitions
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      logger.error('[DocumentParser] Failed to parse PDF', { error });
      throw new Error('Failed to parse PDF file');
    }
  }

  /**
   * Parse a DOCX file buffer to text
   */
  static async parseDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      logger.error('[DocumentParser] Failed to parse DOCX', { error });
      throw new Error('Failed to parse DOCX file');
    }
  }

  /**
   * Parse a text/markdown file buffer to text
   */
  static parseText(buffer: Buffer): string {
    try {
      return buffer.toString('utf-8');
    } catch (error) {
      logger.error('[DocumentParser] Failed to parse text', { error });
      throw new Error('Failed to parse text file');
    }
  }

  /**
   * Auto-detect file type and parse accordingly
   */
  static async parseFile(buffer: Buffer, filename: string): Promise<string> {
    const ext = filename.toLowerCase().split('.').pop();

    logger.info('[DocumentParser] Parsing file', { filename, extension: ext, size: buffer.length });

    switch (ext) {
      case 'pdf':
        return await this.parsePDF(buffer);
      case 'docx':
        return await this.parseDOCX(buffer);
      case 'md':
      case 'markdown':
      case 'txt':
      case 'text':
        return this.parseText(buffer);
      default:
        // Try to parse as text by default
        logger.warn('[DocumentParser] Unknown file type, attempting text parse', { filename });
        return this.parseText(buffer);
    }
  }

  /**
   * Parse base64 encoded file
   */
  static async parseBase64File(base64Data: string, filename: string): Promise<string> {
    try {
      // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
      const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(base64String, 'base64');
      return await this.parseFile(buffer, filename);
    } catch (error) {
      logger.error('[DocumentParser] Failed to parse base64 file', { error, filename });
      throw new Error('Failed to parse base64 encoded file');
    }
  }
}
