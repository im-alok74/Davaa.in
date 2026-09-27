import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth-server'
import { sql } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Build access control based on user type
    let orderResult

    if (user.user_type === 'customer') {
      // Customers can only see their own orders
      orderResult = await sql`
        SELECT 
          o.*,
          u.full_name as customer_full_name,
          u.phone as customer_phone,
          pp.pharmacy_name,
          pp.gst_number,
          pp.address as pharmacy_address,
          pp.city as pharmacy_city,
          pp.state as pharmacy_state,
          pp.pincode as pharmacy_pincode,
          pp.license_number,
          da.street_address as delivery_address_line1,
          da.landmark as delivery_address_line2,
          da.city as delivery_city,
          da.state as delivery_state,
          da.pincode as delivery_pincode
        FROM orders o
        JOIN users u ON o.customer_id = u.id
        LEFT JOIN pharmacy_profiles pp ON o.pharmacy_id = pp.id
        LEFT JOIN addresses da ON o.delivery_address_id = da.id
        WHERE (o.order_number = ${orderId} OR o.id = ${Number(orderId) || 0})
        AND o.customer_id = ${user.id}
        LIMIT 1
      `
    } else if (user.user_type === 'pharmacy') {
      // Pharmacy staff can see orders for their pharmacy
      orderResult = await sql`
        SELECT 
          o.*,
          u.full_name as customer_full_name,
          u.phone as customer_phone,
          pp.pharmacy_name,
          pp.gst_number,
          pp.address as pharmacy_address,
          pp.city as pharmacy_city,
          pp.state as pharmacy_state,
          pp.pincode as pharmacy_pincode,
          pp.license_number,
          u.full_name as delivery_full_name,
          u.phone as delivery_phone,
          da.street_address as delivery_address_line1,
          da.landmark as delivery_address_line2,
          da.city as delivery_city,
          da.state as delivery_state,
          da.pincode as delivery_pincode
        FROM orders o
        JOIN users u ON o.customer_id = u.id
        JOIN pharmacy_profiles pp ON o.pharmacy_id = pp.id AND pp.user_id = ${user.id}
        LEFT JOIN addresses da ON o.delivery_address_id = da.id
        WHERE (o.order_number = ${orderId} OR o.id = ${Number(orderId) || 0})
        LIMIT 1
      `
    } else if (user.user_type === 'admin') {
      // Admins can see all orders
      orderResult = await sql`
        SELECT 
          o.*,
          u.full_name as customer_full_name,
          u.phone as customer_phone,
          pp.pharmacy_name,
          pp.gst_number,
          pp.address as pharmacy_address,
          pp.city as pharmacy_city,
          pp.state as pharmacy_state,
          pp.pincode as pharmacy_pincode,
          pp.license_number,
          da.street_address as delivery_address_line1,
          da.landmark as delivery_address_line2,
          da.city as delivery_city,
          da.state as delivery_state,
          da.pincode as delivery_pincode
        FROM orders o
        JOIN users u ON o.customer_id = u.id
        LEFT JOIN pharmacy_profiles pp ON o.pharmacy_id = pp.id
        LEFT JOIN addresses da ON o.delivery_address_id = da.id
        WHERE (o.order_number = ${orderId} OR o.id = ${Number(orderId) || 0})
        LIMIT 1
      `
    } else {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 })
    }

    if (orderResult.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = orderResult[0] as any

    // Fetch order items with batch details (fallback to NULL if columns don't exist yet)
    let items
    try {
      items = await sql`
        SELECT 
          oi.quantity,
          oi.unit_price,
          oi.discount_percentage,
          oi.total_price,
          oi.batch_number,
          oi.mfg_date,
          oi.expiry_date,
          oi.mrp,
          m.name,
          m.generic_name,
          m.hsn_code
        FROM order_items oi
        JOIN medicines m ON oi.medicine_id = m.id
        WHERE oi.order_id = ${order.id}
      `
    } catch (error) {
      console.log('[v0] Batch columns may not exist yet, fetching without them')
      // Fallback query without batch columns
      items = await sql`
        SELECT 
          oi.quantity,
          oi.unit_price,
          oi.discount_percentage,
          oi.total_price,
          NULL as batch_number,
          NULL as mfg_date,
          NULL as expiry_date,
          NULL as mrp,
          m.name,
          m.generic_name,
          m.hsn_code
        FROM order_items oi
        JOIN medicines m ON oi.medicine_id = m.id
        WHERE oi.order_id = ${order.id}
      `
    }

    // Use the tax actually charged (lib/pricing.ts sums each line's real gst_rate, up
    // to 28%), not a flat 5% — otherwise this "Tax Invoice" doesn't add up to the total
    // it shows for any order containing a non-5%-GST medicine.
    const gst = Number(order.tax_amount ?? 0)

    // Generate HTML invoice
    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Invoice ${order.order_number}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
            font-size: 12px;
          }
          .invoice {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #ddd;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0,0,0,0.05);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #eee;
            padding-bottom: 15px;
          }
          .logo-section {
            display: flex;
            align-items: center;
          }
          .logo {
            height: 50px;
            margin-right: 10px;
          }
          .davaa-title {
            font-size: 24px;
            font-weight: bold;
            color: #28a745; /* A green tone for Davaa.in */
          }
          .tax-invoice-text {
            font-size: 14px;
            color: #555;
            margin-top: 5px;
          }
          .order-info {
            text-align: right;
          }
          .order-info div {
            margin-bottom: 3px;
          }
          .section {
            margin-bottom: 20px;
          }
          .section-title {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 13px;
            text-transform: uppercase;
            color: #555;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background-color: #f8f8f8;
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
            font-weight: bold;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #eee;
          }
          .text-right { text-align: right; }
          .summary {
            float: right;
            width: 300px;
            margin-left: 20px;
            border: 1px solid #eee;
            padding: 15px;
            background-color: #fcfcfc;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
          }
          .summary-total {
            border-top: 1px solid #ddd;
            font-weight: bold;
            padding-top: 10px;
            margin-top: 10px;
            font-size: 14px;
          }
          .seller-info, .buyer-info {
            float: left;
            width: 48%;
          }
          .seller-info {
            margin-right: 4%;
          }
          .clearfix::after {
            content: "";
            display: table;
            clear: both;
          }
          .footer {
            clear: both;
            text-align: center;
            border-top: 1px solid #ddd;
            padding-top: 20px;
            margin-top: 20px;
            font-size: 11px;
            color: #888;
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="logo-section">
              <img src="/davaa-logo.png" alt="Davaa.in Logo" class="logo"/> <!-- Assuming logo is hosted in public folder -->
              <div>
                <div class="davaa-title">Davaa.in</div>
                <div class="tax-invoice-text">Tax Invoice</div>
              </div>
            </div>
            <div class="order-info">
              <div><strong>Order No:</strong> ${order.order_number}</div>
              <div><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString('en-IN')}</div>
              <div><strong>Status:</strong> ${order.order_status.charAt(0).toUpperCase() + order.order_status.slice(1)}</div>
            </div>
          </div>

          <div class="section clearfix">
            <div class="seller-info">
              <div class="section-title">Sold By:</div>
              <div><strong>${order.pharmacy_name || 'N/A'}</strong></div>
              <div>${order.pharmacy_address || 'N/A'}</div>
              <div>${order.pharmacy_city || ''}, ${order.pharmacy_state || ''} - ${order.pharmacy_pincode || ''}</div>
              <div style="margin-top: 10px;">
                <div><strong>License No:</strong> ${order.license_number || 'N/A'}</div>
                <div><strong>GST No:</strong> ${order.gst_number || 'N/A'}</div>
              </div>
            </div>
            <div class="buyer-info">
              <div class="section-title">Bill To:</div>
              <div><strong>${order.delivery_full_name || 'N/A'}</strong></div>
              <div>Phone: ${order.delivery_phone || 'N/A'}</div>
              <div>${order.delivery_address_line1 || 'N/A'}</div>
              ${order.delivery_address_line2 ? `<div>${order.delivery_address_line2}</div>` : ''}
              <div>${order.delivery_city || ''}, ${order.delivery_state || ''} - ${order.delivery_pincode || ''}</div>
            </div>
          </div>

          <div style="clear: both;"></div>

          <table>
            <thead>
              <tr>
                <th>Medicine Name & Details</th>
                <th>HSN</th>
                <th>Batch No</th>
                <th>MFG Date</th>
                <th>EXP Date</th>
                <th>MRP</th>
                <th>Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(items as any[])
                .map(
                  (item) => {
                    const mfgDate = item.mfg_date ? new Date(item.mfg_date).toLocaleDateString('en-IN') : 'N/A'
                    const expDate = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN') : 'N/A'
                    return `
                <tr>
                  <td>
                    <strong>${item.name}</strong><br>
                    <small>Generic: ${item.generic_name}</small>
                  </td>
                  <td>${item.hsn_code || 'N/A'}</td>
                  <td>${item.batch_number || 'N/A'}</td>
                  <td>${mfgDate}</td>
                  <td>${expDate}</td>
                  <td>₹${item.mrp ? Number(item.mrp).toFixed(2) : 'N/A'}</td>
                  <td>${item.quantity}</td>
                  <td class="text-right">₹${Number(item.unit_price).toFixed(2)}</td>
                  <td class="text-right">₹${Number(item.total_price).toFixed(2)}</td>
                </tr>
              `
                  }
                )
                .join('')}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-row">
              <span>Subtotal (Before GST):</span>
              <span>₹${Number(order.subtotal).toFixed(2)}</span>
            </div>
            <div class="summary-row">
              <span>GST (5%):</span>
              <span>₹${gst.toFixed(2)}</span>
            </div>
            <div class="summary-row">
              <span>Delivery Charge:</span>
              <span>${order.delivery_charge === 0 ? 'FREE' : `₹${Number(order.delivery_charge).toFixed(2)}`}</span>
            </div>
            <div class="summary-row summary-total">
              <span>Total Amount:</span>
              <span>₹${Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>

          <div class="footer">
            <p>This is a computer-generated invoice</p>
            <p>For queries, contact support@davaa.in</p>
            <p>Thank you for your purchase!</p>
          </div>
        </div>
      </body>
      </html>
    `

    // Return as HTML that can be printed or converted to PDF
    return new NextResponse(invoiceHTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Invoice_${order.order_number}.html"`
      }
    })
  } catch (error) {
    console.error('[v0] Error generating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    )
  }
}
