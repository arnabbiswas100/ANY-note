const fs = require('fs');

const extractText = async (filePath) => {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return {
      text: data.text || '',
      pageCount: data.numpages || 0,
      info: data.info || {}
    };
  } catch (err) {
    console.error('PDF parse error:', err.message);
    return { text: '', pageCount: 0, info: {} };
  }
};

module.exports = { extractText };
