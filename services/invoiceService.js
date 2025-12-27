import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// Business details (from your registration)
const BUSINESS = {
    name: 'Kristia Private Limited',
    address: '121002',
    country: 'India',
    gstin: '06AAMCK1604M1ZF',
    phone: '9429694910',
    email: 'support@thevelvettails.com',
    website: 'www.thevelvettails.com',
    stateCode: '06',
    stateName: 'Haryana'
};

// State codes for CGST/SGST vs IGST determination
const STATE_CODES = {
    'Andhra Pradesh': '37', 'Arunachal Pradesh': '12', 'Assam': '18', 'Bihar': '10',
    'Chhattisgarh': '22', 'Delhi': '07', 'Goa': '30', 'Gujarat': '24', 'Haryana': '06',
    'Himachal Pradesh': '02', 'Jharkhand': '20', 'Karnataka': '29', 'Kerala': '32',
    'Madhya Pradesh': '23', 'Maharashtra': '27', 'Manipur': '14', 'Meghalaya': '17',
    'Mizoram': '15', 'Nagaland': '13', 'Odisha': '21', 'Punjab': '03', 'Rajasthan': '08',
    'Sikkim': '11', 'Tamil Nadu': '33', 'Telangana': '36', 'Tripura': '16',
    'Uttar Pradesh': '09', 'Uttarakhand': '05', 'West Bengal': '19',
    'Andaman and Nicobar Islands': '35', 'Chandigarh': '04', 'Dadra and Nagar Haveli': '26',
    'Daman and Diu': '25', 'Jammu and Kashmir': '01', 'Ladakh': '38', 'Lakshadweep': '31',
    'Puducherry': '34'
};

/**
 * Generate sequential invoice number
 */
export const generateInvoiceNumber = async (Order) => {
    const currentYear = new Date().getFullYear();
    const fiscalYear = new Date().getMonth() >= 3 ? currentYear : currentYear - 1;

    // Count invoices in current fiscal year
    const startOfFiscalYear = new Date(fiscalYear, 3, 1); // April 1
    const count = await Order.countDocuments({
        invoiceNumber: { $exists: true, $ne: null },
        createdAt: { $gte: startOfFiscalYear }
    });

    const invoiceNum = String(count + 1).padStart(6, '0');
    return `TVT${String(fiscalYear).slice(-2)}${String(fiscalYear + 1).slice(-2)}${invoiceNum}`;
};

/**
 * Convert number to words (for Indian currency)
 */
const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';
    if (num < 0) return 'Minus ' + numberToWords(-num);

    let words = '';

    if (Math.floor(num / 10000000) > 0) {
        words += numberToWords(Math.floor(num / 10000000)) + ' Crore ';
        num %= 10000000;
    }
    if (Math.floor(num / 100000) > 0) {
        words += numberToWords(Math.floor(num / 100000)) + ' Lakh ';
        num %= 100000;
    }
    if (Math.floor(num / 1000) > 0) {
        words += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
        num %= 1000;
    }
    if (Math.floor(num / 100) > 0) {
        words += numberToWords(Math.floor(num / 100)) + ' Hundred ';
        num %= 100;
    }
    if (num > 0) {
        if (num < 20) {
            words += ones[num];
        } else {
            words += tens[Math.floor(num / 10)];
            if (num % 10 > 0) words += ' ' + ones[num % 10];
        }
    }

    return words.trim();
};

const amountInWords = (amountPaise) => {
    const rupees = Math.floor(amountPaise / 100);
    const paise = amountPaise % 100;

    let words = 'Indian Rupee ' + numberToWords(rupees);
    if (paise > 0) {
        words += ' and ' + numberToWords(paise) + ' Paise';
    }
    words += ' Only';
    return words;
};

/**
 * Determine if IGST or CGST+SGST based on customer state
 */
const getGSTType = (customerState) => {
    const customerStateCode = STATE_CODES[customerState] || STATE_CODES['Delhi'];
    return customerStateCode === BUSINESS.stateCode ? 'intra' : 'inter';
};

/**
 * Generate PDF invoice
 * @param {Object} order - Order document
 * @param {Object} taxConfig - Tax configuration
 * @returns {Promise<Buffer>} - PDF buffer
 */
export const generateInvoicePDF = async (order, taxConfig) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 40,
                info: {
                    Title: `Invoice ${order.invoiceNumber || order.orderNumber}`,
                    Author: BUSINESS.name
                }
            });

            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            const pageWidth = doc.page.width - 80; // margins
            const gstRate = taxConfig?.rate || 18;
            const gstType = getGSTType(order.shippingAddress?.state);

            // Colors
            const purple = '#5C3975';
            const lightGray = '#f5f5f5';

            // ===== HEADER =====
            // Logo - use actual PNG logo
            const logoPath = path.join(process.cwd(), 'public', '215344079_padded_logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 35, { width: 70 });
            } else {
                // Fallback: text-based logo if file not found
                doc.circle(80, 70, 30).fill(purple);
                doc.fillColor('white').fontSize(8).text('The', 65, 58);
                doc.fontSize(7).text('Velvet Tails', 58, 68);
            }
            doc.fillColor('black');

            // Company details
            doc.fontSize(14).font('Helvetica-Bold').fillColor(purple)
                .text(BUSINESS.name, 130, 40);
            doc.fontSize(9).font('Helvetica').fillColor('black')
                .text(BUSINESS.address, 130, 58)
                .text(BUSINESS.country, 130, 70)
                .text(`GSTIN ${BUSINESS.gstin}`, 130, 82)
                .text(BUSINESS.phone, 130, 94)
                .text(BUSINESS.email, 130, 106)
                .text(BUSINESS.website, 130, 118);

            // TAX INVOICE title
            doc.fontSize(24).font('Helvetica-Bold').fillColor(purple)
                .text('TAX INVOICE', 400, 70, { align: 'right', width: 150 });

            // ===== INVOICE DETAILS =====
            const detailsY = 150;
            doc.rect(40, detailsY, pageWidth, 60).fill(lightGray);

            doc.fillColor(purple).fontSize(9).font('Helvetica-Bold');
            doc.text('#', 50, detailsY + 10);
            doc.text('Invoice Date', 50, detailsY + 22);
            doc.text('Terms', 50, detailsY + 34);
            doc.text('Due Date', 50, detailsY + 46);

            doc.fillColor('black').font('Helvetica');
            const invoiceDate = new Date(order.createdAt).toLocaleDateString('en-IN');
            doc.text(`: ${order.invoiceNumber || order.orderNumber}`, 110, detailsY + 10);
            doc.text(`: ${invoiceDate}`, 110, detailsY + 22);
            doc.text(': Due on Receipt', 110, detailsY + 34);
            doc.text(`: ${invoiceDate}`, 110, detailsY + 46);

            // Place of Supply
            doc.font('Helvetica-Bold').text('Place Of Supply', 320, detailsY + 22);
            const customerState = order.shippingAddress?.state || 'Delhi';
            const customerStateCode = STATE_CODES[customerState] || '07';
            doc.font('Helvetica').fillColor(purple)
                .text(`: ${customerState} (${customerStateCode})`, 400, detailsY + 22);

            // ===== CUSTOMER DETAILS =====
            const customerY = detailsY + 70;
            doc.fillColor('black').fontSize(10).font('Helvetica-Bold')
                .text('Bill To:', 50, customerY);
            doc.fontSize(9).font('Helvetica')
                .text(order.shippingAddress?.name || 'Customer', 50, customerY + 15)
                .text(order.shippingAddress?.street || '', 50, customerY + 27)
                .text(`${order.shippingAddress?.city || ''}, ${customerState} ${order.shippingAddress?.pincode || ''}`, 50, customerY + 39)
                .text(`Phone: ${order.shippingAddress?.phone || ''}`, 50, customerY + 51);

            // ===== ITEMS TABLE =====
            const tableY = customerY + 80;
            const colWidths = gstType === 'intra'
                ? [25, 180, 50, 55, 40, 50, 40, 50, 60]  // CGST + SGST (no HSN)
                : [25, 200, 50, 60, 45, 60, 70];          // IGST (no HSN)

            // Table header
            doc.rect(40, tableY, pageWidth, 25).fill(lightGray);
            doc.fillColor('black').fontSize(8).font('Helvetica-Bold');

            let xPos = 50;
            const headers = gstType === 'intra'
                ? ['#', 'Description', 'Qty', 'Rate', 'CGST %', 'Amt', 'SGST %', 'Amt', 'Amount']
                : ['#', 'Description', 'Qty', 'Rate', 'IGST %', 'Amt', 'Amount'];

            headers.forEach((header, i) => {
                doc.text(header, xPos, tableY + 8, { width: colWidths[i], align: i === 0 ? 'left' : 'center' });
                xPos += colWidths[i];
            });

            // Table rows
            let rowY = tableY + 30;
            const halfGstRate = gstRate / 2;

            order.items.forEach((item, index) => {
                const unitPrice = (item.price / 100);
                const itemTotal = unitPrice * item.qty;
                const taxableAmount = itemTotal / (1 + gstRate / 100); // Extract base from tax-inclusive
                const gstAmount = itemTotal - taxableAmount;
                const halfGstAmount = gstAmount / 2;

                xPos = 50;
                doc.font('Helvetica').fontSize(8);

                const rowData = gstType === 'intra'
                    ? [
                        String(index + 1),
                        item.title || 'Product',
                        `${item.qty} pcs`,
                        unitPrice.toFixed(2),
                        `${halfGstRate}%`,
                        halfGstAmount.toFixed(2),
                        `${halfGstRate}%`,
                        halfGstAmount.toFixed(2),
                        itemTotal.toFixed(2)
                    ]
                    : [
                        String(index + 1),
                        item.title || 'Product',
                        `${item.qty} pcs`,
                        unitPrice.toFixed(2),
                        `${gstRate}%`,
                        gstAmount.toFixed(2),
                        itemTotal.toFixed(2)
                    ];

                rowData.forEach((data, i) => {
                    doc.text(data, xPos, rowY, { width: colWidths[i], align: i <= 1 ? 'left' : 'center' });
                    xPos += colWidths[i];
                });

                rowY += 20;
            });

            // Table bottom line
            doc.moveTo(40, rowY + 5).lineTo(40 + pageWidth, rowY + 5).stroke('#ddd');

            // ===== TOTALS SECTION =====
            const totalsY = rowY + 20;
            const totalsX = 350;

            // Calculate totals
            const subtotal = order.subtotal / 100;
            const discountAmount = order.discount / 100;
            const taxableAfterDiscount = subtotal - discountAmount;
            const taxAmount = order.tax / 100;
            const grandTotal = order.amount / 100;

            doc.fontSize(9).font('Helvetica');

            // Sub Total
            doc.text('Sub Total', totalsX, totalsY);
            doc.text(subtotal.toFixed(2), totalsX + 120, totalsY, { align: 'right', width: 80 });

            // Discount (if any)
            if (discountAmount > 0) {
                const discountPercent = ((discountAmount / subtotal) * 100).toFixed(2);
                doc.text(`Discount(${discountPercent}%)`, totalsX, totalsY + 25);
                doc.text(`(Applied on ${taxableAfterDiscount.toFixed(2)})`, totalsX, totalsY + 35, { fontSize: 7 });
                doc.fillColor('red').text(`(-) ${discountAmount.toFixed(2)}`, totalsX + 120, totalsY + 25, { align: 'right', width: 80 });
                doc.fillColor('black');
            }

            const taxY = discountAmount > 0 ? totalsY + 55 : totalsY + 25;

            // GST breakdown
            if (gstType === 'intra') {
                const halfTax = taxAmount / 2;
                doc.text(`CGST9 (${gstRate / 2}%)`, totalsX, taxY);
                doc.text(halfTax.toFixed(2), totalsX + 120, taxY, { align: 'right', width: 80 });
                doc.text(`SGST9 (${gstRate / 2}%)`, totalsX, taxY + 15);
                doc.text(halfTax.toFixed(2), totalsX + 120, taxY + 15, { align: 'right', width: 80 });
            } else {
                doc.text(`IGST (${gstRate}%)`, totalsX, taxY);
                doc.text(taxAmount.toFixed(2), totalsX + 120, taxY, { align: 'right', width: 80 });
            }

            const totalLineY = gstType === 'intra' ? taxY + 35 : taxY + 20;

            // Total
            doc.font('Helvetica-Bold');
            doc.text('Total', totalsX, totalLineY);
            doc.text(`₹${grandTotal.toFixed(2)}`, totalsX + 120, totalLineY, { align: 'right', width: 80 });

            // Payment Made
            doc.font('Helvetica').text('Payment Made', totalsX, totalLineY + 15);
            doc.fillColor('green').text(`(-) ${grandTotal.toFixed(2)}`, totalsX + 120, totalLineY + 15, { align: 'right', width: 80 });

            // Balance Due
            doc.fillColor('black').font('Helvetica-Bold')
                .text('Balance Due', totalsX, totalLineY + 30);
            doc.text('₹0.00', totalsX + 120, totalLineY + 30, { align: 'right', width: 80 });

            // ===== FOOTER =====
            const footerY = totalLineY + 60;

            // Total in words
            doc.font('Helvetica-Bold').fontSize(9)
                .text('Total In Words', 50, totalsY);
            doc.font('Helvetica-BoldOblique').fontSize(9)
                .text(amountInWords(order.amount), 50, totalsY + 12);

            doc.font('Helvetica').fontSize(9)
                .text('Thanks for your business.', 50, totalsY + 40);

            // Order reference
            doc.fontSize(8).fillColor('#666')
                .text(`Order: ${order.orderNumber}`, 50, footerY + 40);

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

export default { generateInvoicePDF, generateInvoiceNumber };
