import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const category = searchParams.get('category') || ''
    const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : null
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : null
    const requiresPrescription = searchParams.get('prescription')
    const sortBy = searchParams.get('sortBy') || 'popularity'
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50))
    const offset = Number(searchParams.get('offset')) || 0

    const q = query.trim()
    const qLike = `%${q.toLowerCase()}%`
    const qPrefixLike = `${q.toLowerCase()}%`
    const qNoVowels = q.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/[aeiou]/g, '')
    const qNoVowelsLike = `%${qNoVowels}%`
    const prescriptionFilter =
      requiresPrescription === 'true' ? true : requiresPrescription === 'false' ? false : null

    const medicines = await sql`
      WITH matched_medicines AS (
        SELECT
          m.id,
          m.name,
          m.slug,
          m.generic_name,
          m.manufacturer,
          m.category,
          m.strength,
          m.form,
          m.pack_size,
          m.mrp,
          m.image_url,
          m.requires_prescription,
          m.popularity_score,
          COUNT(*) OVER () AS total_count,
          CASE
            WHEN ${q} = '' THEN 2
            WHEN LOWER(m.name) = ${q.toLowerCase()} THEN 0
            WHEN LOWER(m.name) LIKE ${qPrefixLike} THEN 1
            WHEN LOWER(m.name) LIKE ${qLike} THEN 2
            WHEN LOWER(m.generic_name) LIKE ${qLike} THEN 3
            WHEN LOWER(m.manufacturer) LIKE ${qLike} THEN 4
            WHEN translate(LOWER(m.name), 'aeiou', '') LIKE ${qNoVowelsLike} THEN 5
            WHEN translate(LOWER(m.generic_name), 'aeiou', '') LIKE ${qNoVowelsLike} THEN 5
            WHEN translate(LOWER(m.manufacturer), 'aeiou', '') LIKE ${qNoVowelsLike} THEN 5
            ELSE 5
          END AS match_rank
        FROM medicines m
        WHERE m.status = 'active'
          AND (${q === ''} OR (
            LOWER(m.name) LIKE ${qLike}
            OR LOWER(m.generic_name) LIKE ${qLike}
            OR LOWER(m.manufacturer) LIKE ${qLike}
            OR translate(LOWER(m.name), 'aeiou', '') LIKE ${qNoVowelsLike}
            OR translate(LOWER(m.generic_name), 'aeiou', '') LIKE ${qNoVowelsLike}
            OR translate(LOWER(m.manufacturer), 'aeiou', '') LIKE ${qNoVowelsLike}
          ))
          AND (${category === ''} OR m.category = ${category})
          AND (${minPrice === null} OR m.mrp >= ${minPrice})
          AND (${maxPrice === null} OR m.mrp <= ${maxPrice})
          AND (${prescriptionFilter === null} OR m.requires_prescription = ${prescriptionFilter})
      )
      SELECT
        m.id,
        m.name,
        m.slug,
        m.generic_name,
        m.manufacturer,
        m.category,
        m.strength,
        m.form,
        m.pack_size,
        m.mrp,
        m.image_url,
        m.requires_prescription,
        offer.selling_price,
        offer.discount_percentage,
        offer.pharmacy_name,
        offer.pharmacy_id,
        COALESCE(
          offer.selling_price - (offer.selling_price * COALESCE(offer.discount_percentage, 0) / 100.0),
          m.mrp
        ) AS final_price,
        COALESCE(
          json_agg(mi.image_url) FILTER (WHERE mi.image_url IS NOT NULL),
          '[]'
        ) AS images,
        m.total_count
      FROM matched_medicines m
      LEFT JOIN LATERAL (
        SELECT
          pi.selling_price,
          pi.discount_percentage,
          pp.pharmacy_name,
          pp.id AS pharmacy_id
        FROM pharmacy_inventory pi
        JOIN pharmacy_profiles pp
          ON pp.id = pi.pharmacy_id
         AND pp.verification_status = 'verified'
        WHERE pi.medicine_id = m.id
          AND pi.stock_quantity > 0
          AND (pi.expiry_date IS NULL OR pi.expiry_date >= CURRENT_DATE)
        ORDER BY COALESCE(pi.discount_percentage, 0) DESC, pi.selling_price ASC
        LIMIT 1
      ) offer ON true
      LEFT JOIN medicine_images mi ON mi.medicine_id = m.id
      GROUP BY
        m.id,
        m.name,
        m.slug,
        m.generic_name,
        m.manufacturer,
        m.category,
        m.strength,
        m.form,
        m.pack_size,
        m.mrp,
        m.image_url,
        m.requires_prescription,
        offer.selling_price,
        offer.discount_percentage,
        offer.pharmacy_name,
        offer.pharmacy_id,
        m.total_count,
        m.match_rank,
        m.popularity_score
      ORDER BY
        m.match_rank ASC,
        CASE WHEN ${sortBy} = 'popularity' THEN m.popularity_score END DESC NULLS LAST,
        CASE WHEN ${sortBy} = 'price_high' THEN m.mrp END DESC,
        CASE WHEN ${sortBy} = 'price_low' THEN m.mrp END ASC,
        CASE WHEN ${sortBy} = 'name' THEN m.name END ASC,
        m.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `

    // Get unique categories for filter
    const categories = await sql`
      SELECT DISTINCT m.category
      FROM medicines m
      WHERE m.status = 'active'
        AND m.category IS NOT NULL
        AND m.category <> ''
      ORDER BY m.category
    `

    return NextResponse.json({
      medicines,
      categories: (categories as any[]).map((c) => c.category),
      total: (medicines as any[]).length > 0 ? Number((medicines as any[])[0].total_count) : 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error searching medicines:', error)
    return NextResponse.json(
      { error: 'Failed to search medicines' },
      { status: 500 }
    )
  }
}
