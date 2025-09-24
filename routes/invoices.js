const express = require('express');
const { auth } = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const PDFDocument = require('pdfkit');

const router = express.Router();

// GET /api/invoices - list invoices for current user
router.get('/', auth, async (req, res) => {
	try {
		const invoices = await Invoice.find({ user: req.user.id }).sort({ createdAt: -1 });
		return res.json({ success: true, data: invoices });
	} catch (err) {
		console.error('List invoices error:', err);
		return res.status(500).json({ success: false, message: 'Internal server error' });
	}
});

// GET /api/invoices/:id/pdf - download invoice PDF
router.get('/:id/pdf', auth, async (req, res) => {
	try {
		const invoice = await Invoice.findById(req.params.id);
		if (!invoice || invoice.user.toString() !== req.user.id) {
			return res.status(404).json({ success: false, message: 'Invoice not found' });
		}

		// Generate a professional PDF invoice using PDFKit
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice._id}.pdf`);

		const doc = new PDFDocument({ margin: 48, size: 'A4' });
		doc.pipe(res);

		const brand = {
			name: 'Audix',
			address: ['Audix Cherukarakunnel', 'Idukki', 'Kerala', '685553', 'India'],
			email: 'audix@gmail.com',
			website: ''
		};

		const fmtINR = (n) => `${invoice.currency} ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n || 0))}`;
		const drawDivider = (y) => { doc.moveTo(48, y).lineTo(547, y).lineWidth(0.5).strokeColor('#e5e7eb').stroke(); };

		// Header
		doc
			.fillColor('#111827')
			.fontSize(22)
			.text(brand.name, 48, 48)
			.fontSize(10)
			.fillColor('#6b7280');
		const contactLine = brand.website ? `${brand.email} · ${brand.website}` : brand.email;
		doc.text(brand.address.join(', '));
		doc.text(contactLine);

		doc.fontSize(16).fillColor('#111827').text('INVOICE', 400, 48, { align: 'left' });
		doc.fontSize(10).fillColor('#6b7280')
			.text(`Invoice ID: ${invoice._id}`, 400)
			.text(`Issued: ${new Date().toLocaleString()}`, 400);

		drawDivider(110);

		// Bill To
		doc.fillColor('#111827').fontSize(12).text('Bill To', 48, 122);
		doc.fillColor('#374151').fontSize(11).text(`${req.user.email}`, 48, 140);

		// Invoice Meta Right
		const periodStart = invoice.periodStart ? new Date(invoice.periodStart).toLocaleDateString() : '-';
		const periodEnd = invoice.periodEnd ? new Date(invoice.periodEnd).toLocaleDateString() : '-';
		doc.fillColor('#6b7280').fontSize(10).text('Plan', 340, 122);
		doc.fillColor('#111827').fontSize(11).text(String(invoice.plan || '').toUpperCase(), 340, 136);
		doc.fillColor('#6b7280').fontSize(10).text('Period', 340, 156);
		doc.fillColor('#111827').fontSize(11).text(`${periodStart} → ${periodEnd}`, 340, 170);

		drawDivider(198);

		// Line items table header
		let y = 214;
		doc.fillColor('#6b7280').fontSize(10);
		doc.text('Description', 48, y);
		doc.text('Qty', 340, y, { width: 50, align: 'right' });
		doc.text('Unit Price', 400, y, { width: 70, align: 'right' });
		doc.text('Amount', 480, y, { width: 67, align: 'right' });
		y += 10;
		drawDivider(y + 6);
		y += 16;

		// Single line item
		doc.fillColor('#111827').fontSize(11);
		doc.text(`Audix Premium – ${String(invoice.plan || '').toUpperCase()} plan`, 48, y);
		doc.text('1', 340, y, { width: 50, align: 'right' });
		doc.text(fmtINR(invoice.amount), 400, y, { width: 70, align: 'right' });
		doc.text(fmtINR(invoice.amount), 480, y, { width: 67, align: 'right' });
		y += 24;

		drawDivider(y + 6);
		y += 18;

		// Totals
		doc.fillColor('#6b7280').fontSize(10).text('Subtotal', 400, y, { width: 80, align: 'right' });
		doc.fillColor('#111827').fontSize(11).text(fmtINR(invoice.amount), 480, y, { width: 67, align: 'right' });
		y += 16;
		doc.fillColor('#6b7280').fontSize(10).text('Tax (0%)', 400, y, { width: 80, align: 'right' });
		doc.fillColor('#111827').fontSize(11).text(fmtINR(0), 480, y, { width: 67, align: 'right' });
		y += 16;
		drawDivider(y + 6);
		y += 18;
		doc.fillColor('#111827').fontSize(12).text('Total', 400, y, { width: 80, align: 'right' });
		doc.fontSize(12).text(fmtINR(invoice.amount), 480, y, { width: 67, align: 'right' });
		y += 30;

		// Payment details
		doc.fillColor('#6b7280').fontSize(10).text('Payment', 48, y);
		doc.fillColor('#111827').fontSize(11).text(`Status: ${invoice.status}`, 48, y + 14);
		doc.fillColor('#111827').fontSize(11).text(`Payment ID: ${invoice.paymentId || '-'}`, 48, y + 28);
		y += 56;

		drawDivider(y);
		y += 16;

		// Footer
		doc.fillColor('#6b7280').fontSize(9)
			.text('This is a computer-generated invoice. No signature required.', 48, y)
			.text(`Need help? Contact ${brand.email}`, 48, y + 14)
			.text(`© ${new Date().getFullYear()} ${brand.name}. All rights reserved.`, 48, y + 28);

		doc.end();
	} catch (err) {
		console.error('Invoice PDF error:', err);
		return res.status(500).json({ success: false, message: 'Internal server error' });
	}
});

module.exports = router;






