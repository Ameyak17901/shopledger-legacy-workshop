'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');

var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

function makeOrder(items, coupon) {
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 1001,
    date: '01/01/2022',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice matches the billed HSN slab GST breakdown and order total', function () {
  var order = makeOrder([
    { id: 1, sku: 'RICE-1', name: 'Rice', hsn: '1006', price: 100, qty: 1 }
  ]);
  var ledgerLine = pricing.computeTotals(order.items, order.coupon).lines[0];
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(ledgerLine.gstPercent, 5);
  assert.equal(order.tax, 5);
  assert.equal(order.total, 105);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.tax, 5);
  assert.equal(invoiceFigures.cgst, 2.5);
  assert.equal(invoiceFigures.sgst, 2.5);
  assert.equal(invoiceFigures.total, 105);
  var invoiceHtml = invoice.render(order);
  assert.match(invoiceHtml, /<td class="r">5%<\/td>/);
  assert.match(invoiceHtml, /Invoice Total<\/td><td class="r">[^<]*105\.00/);
  assert.doesNotMatch(invoiceHtml, /class="warn-box"/);

  var reconciliation = reports.getGstReconciliation({ orders: [order] });
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.rows[0].delta, 0);
});

test('invoice matches the billed coupon cap, post-discount GST, and order total', function () {
  var order = makeOrder([
    { id: 2, sku: 'BULK-1', name: 'Bulk item', hsn: '0902', gstRate: 18, price: 4000, qty: 1 }
  ], 'WHOLESALE15');
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(order.discount, 400);
  assert.equal(order.tax, 648);
  assert.equal(order.total, 4248);
  assert.equal(invoiceFigures.discount, 400);
  assert.equal(invoiceFigures.tax, 648);
  assert.equal(invoiceFigures.total, 4248);
  var invoiceHtml = invoice.render(order);
  assert.match(invoiceHtml, /Taxable Value/);
  assert.match(invoiceHtml, /<td class="r">₹648\.00<\/td><td class="r"><strong>₹3600\.00<\/strong><\/td>/);

  var reconciliation = reports.getGstReconciliation({ orders: [order] });
  assert.equal(reconciliation.rows[0].invoiceDiscount, 400);
  assert.equal(reconciliation.rows[0].invoiceTax, 648);
  assert.equal(reconciliation.rows[0].delta, 0);
});

test('CURRENT BEHAVIOUR: pricing rounds each taxable line before summing GST and splits the rounded tax equally', function () {
  var totals = pricing.computeTotals([
    { id: 3, name: 'Line A', hsn: '0902', price: 0.05, qty: 1 },
    { id: 4, name: 'Line B', hsn: '0902', price: 0.05, qty: 1 }
  ], '');

  assert.equal(totals.tax, 0.02);
  assert.equal(totals.cgst, 0.01);
  assert.equal(totals.sgst, 0.01);
  assert.equal(totals.total, 0.12);
});
