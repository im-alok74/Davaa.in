import { redirect } from 'next/navigation'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { getCurrentUser } from '@/lib/auth-server'
import { checkSellerVerification, getSellerProfile } from '@/lib/seller-auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

async function updateMedicine(formData: FormData) {
  'use server'

  const user = await getCurrentUser()
  if (!user || user.user_type !== 'pharmacy') {
    redirect('/signin')
  }

  const verification = await checkSellerVerification(user.id, 'pharmacy')
  if (!verification.verified) {
    redirect('/pharmacy/medicines')
  }

  const profile = await getSellerProfile(user.id, 'pharmacy')
  if (!profile) {
    redirect('/pharmacy/register')
  }

  const inventoryId = Number(formData.get('inventory_id'))
  const stockQuantity = Number(formData.get('stock_quantity'))
  const sellingPrice = Number(formData.get('selling_price'))
  const discountPercentage = Number(formData.get('discount_percentage')) || 0

  try {
    // Verify ownership
    const inventory = await sql`
      SELECT pi.id, COALESCE(pi.mrp, m.mrp) AS mrp
      FROM pharmacy_inventory pi
      JOIN medicines m ON m.id = pi.medicine_id
      WHERE pi.id = ${inventoryId} AND pi.pharmacy_id = ${(profile as any).id}
    `

    if (inventory.length === 0) {
      throw new Error('Medicine not found or unauthorized')
    }

    const applicableMrp = Number(inventory[0].mrp ?? 0)
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      throw new Error('Selling price must be greater than zero')
    }
    if (applicableMrp > 0 && sellingPrice > applicableMrp) {
      throw new Error(`Selling price cannot exceed MRP (₹${applicableMrp.toFixed(2)})`)
    }
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      throw new Error('Stock quantity cannot be negative')
    }

    await sql`
      UPDATE pharmacy_inventory
      SET 
        stock_quantity = ${stockQuantity},
        selling_price = ${sellingPrice},
        discount_percentage = ${discountPercentage},
        last_updated = CURRENT_TIMESTAMP
      WHERE id = ${inventoryId}
    `

    redirect('/pharmacy/medicines?updated=true')
  } catch (error) {
    console.error('[v0] Error updating medicine:', error)
    throw error
  }
}

export default async function EditMedicinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()

  if (!user || user.user_type !== 'pharmacy') {
    redirect('/signin')
  }

  const verification = await checkSellerVerification(user.id, 'pharmacy')
  const profile = await getSellerProfile(user.id, 'pharmacy')

  if (!profile || !verification.verified) {
    redirect('/pharmacy/medicines')
  }

  const { id } = await params
  const inventoryId = Number(id)
  if (Number.isNaN(inventoryId)) {
    redirect('/pharmacy/medicines')
  }

  // Fetch medicine details
  const inventoryResult = await sql`
    SELECT 
      pi.*,
      m.name,
      m.generic_name,
      m.manufacturer,
      m.category,
      m.strength,
      COALESCE(pi.mrp, m.mrp) AS mrp
    FROM pharmacy_inventory pi
    JOIN medicines m ON pi.medicine_id = m.id
    WHERE pi.id = ${inventoryId} AND pi.pharmacy_id = ${(profile as any).id}
  `

  if (inventoryResult.length === 0) {
    redirect('/pharmacy/medicines')
  }

  const medicine = inventoryResult[0] as any

  return (
    <div className='flex min-h-screen flex-col'>
      <Header />
      <main className='flex-1'>
        <div className='container mx-auto px-4 py-8'>
          <div className='mb-6 flex items-center gap-3'>
            <Link href='/pharmacy/medicines'>
              <Button variant='ghost' size='icon'>
                <ArrowLeft className='h-4 w-4' />
              </Button>
            </Link>
            <h1 className='text-3xl font-bold text-foreground'>Edit Medicine</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{medicine.name}</CardTitle>
              <p className='text-sm text-muted-foreground mt-2'>
                {medicine.generic_name} • {medicine.category}
              </p>
            </CardHeader>
            <CardContent>
              <form action={updateMedicine} className='space-y-6'>
                <input type='hidden' name='inventory_id' value={inventoryId} />

                <div className='bg-muted/50 p-4 rounded-lg border border-muted'>
                  <div className='grid md:grid-cols-2 gap-4 text-sm'>
                    <div>
                      <p className='text-muted-foreground'>Manufacturer</p>
                      <p className='font-medium text-foreground'>{medicine.manufacturer}</p>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>Strength</p>
                      <p className='font-medium text-foreground'>{medicine.strength}</p>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>MRP (Max Retail Price)</p>
                      <p className='font-medium text-foreground'>₹{Number(medicine.mrp).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>Batch Number</p>
                      <p className='font-medium text-foreground'>{medicine.batch_number || '-'}</p>
                    </div>
                  </div>
                </div>

                <div className='grid md:grid-cols-2 gap-4'>
                  <div>
                    <label htmlFor='stock_quantity' className='block text-sm font-medium mb-2'>
                      Stock Quantity <span className='text-destructive'>*</span>
                    </label>
                    <Input
                      type='number'
                      id='stock_quantity'
                      name='stock_quantity'
                      required
                      min='0'
                      defaultValue={medicine.stock_quantity}
                    />
                  </div>

                  <div>
                    <label htmlFor='selling_price' className='block text-sm font-medium mb-2'>
                      Selling Price (₹) <span className='text-destructive'>*</span>
                    </label>
                    <Input
                      type='number'
                      id='selling_price'
                      name='selling_price'
                      required
                      step='0.01'
                      min='0'
                      max={medicine.mrp > 0 ? Number(medicine.mrp).toFixed(2) : undefined}
                      defaultValue={Number(medicine.selling_price).toFixed(2)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor='discount_percentage' className='block text-sm font-medium mb-2'>
                    Discount (%)
                  </label>
                  <Input
                    type='number'
                    id='discount_percentage'
                    name='discount_percentage'
                    step='0.01'
                    min='0'
                    max='100'
                    defaultValue={Number(medicine.discount_percentage).toFixed(2)}
                  />
                </div>

                <div className='flex gap-3'>
                  <Button type='submit'>Update Medicine</Button>
                  <Link href='/pharmacy/medicines'>
                    <Button variant='outline'>Cancel</Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  )
}
