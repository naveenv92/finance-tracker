/**
 * CSV Parser utility
 * Handles CSV parsing with quoted fields and different line endings
 */

export class CSVParser {
  /**
   * Parse CSV text into headers and rows
   * @param {string} csvText - Raw CSV text
   * @returns {Object} Object with headers and rows arrays
   */
  static parse(csvText) {
    if (!csvText || typeof csvText !== 'string') {
      return { headers: [], rows: [] };
    }

    // Normalize line endings to \n
    const normalizedText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split into lines
    const lines = this.splitLines(normalizedText);

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    // Parse header row
    const headers = this.parseLine(lines[0]);

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue; // Skip empty lines

      const values = this.parseLine(line);

      // Create object mapping headers to values
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      rows.push(row);
    }

    return { headers, rows };
  }

  /**
   * Split CSV text into lines, respecting quoted fields
   * @param {string} text - CSV text
   * @returns {Array<string>} Array of line strings
   */
  static splitLines(text) {
    const lines = [];
    let currentLine = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
      } else if (char === '\n' && !inQuotes) {
        lines.push(currentLine);
        currentLine = '';
      } else {
        currentLine += char;
      }
    }

    // Add last line if not empty
    if (currentLine.trim() !== '') {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Parse a single CSV line into values
   * @param {string} line - CSV line
   * @returns {Array<string>} Array of values
   */
  static parseLine(line) {
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        // Escaped quote (two quotes in a row)
        currentValue += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        // Toggle quote state
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        // End of value
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add last value
    values.push(currentValue.trim());

    return values;
  }

  /**
   * Validate that required columns exist in headers
   * @param {Array<string>} headers - CSV headers
   * @param {Object} template - Template with column mappings
   * @returns {Object} Validation result with isValid and missing fields
   */
  static validateColumns(headers, template) {
    const requiredColumns = [
      template.dateColumn,
      template.merchantColumn,
      template.amountColumn
    ];

    const missing = requiredColumns.filter(col => !headers.includes(col));

    return {
      isValid: missing.length === 0,
      missing
    };
  }

  /**
   * Extract value from row using column name
   * @param {Object} row - Row object
   * @param {string} columnName - Column name
   * @returns {string} Value or empty string
   */
  static getValue(row, columnName) {
    return row[columnName] || '';
  }
}
