import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-server'
import { sql } from '@/lib/db'

// GET /api/admin/users - Get all users (with optional search, filter, pagination)
export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin'])

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query') || ''
    const typeFilter = searchParams.get('type') || 'all'
    const statusFilter = searchParams.get('status') || 'all'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit

    console.log('[ADMIN USERS] GET with params:', { query, typeFilter, statusFilter, page, limit })

    // Build WHERE clause based on filters
    let users: any[] = []
    let totalUsers = 0

    if (query && typeFilter !== 'all' && statusFilter !== 'all') {
      // All filters applied
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        WHERE (full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'})
        AND user_type = ${typeFilter}
        AND status = ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
        WHERE (full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'})
        AND user_type = ${typeFilter}
        AND status = ${statusFilter}
      `
      totalUsers = countResult[0].total
    } else if (query && typeFilter !== 'all') {
      // Query and type filter
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        WHERE (full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'})
        AND user_type = ${typeFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
        WHERE (full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'})
        AND user_type = ${typeFilter}
      `
      totalUsers = countResult[0].total
    } else if (query && statusFilter !== 'all') {
      // Query and status filter
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        WHERE (full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'})
        AND status = ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
        WHERE (full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'})
        AND status = ${statusFilter}
      `
      totalUsers = countResult[0].total
    } else if (typeFilter !== 'all' && statusFilter !== 'all') {
      // Type and status filter
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        WHERE user_type = ${typeFilter}
        AND status = ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
        WHERE user_type = ${typeFilter}
        AND status = ${statusFilter}
      `
      totalUsers = countResult[0].total
    } else if (query) {
      // Query only
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        WHERE full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
        WHERE full_name ILIKE ${'%' + query + '%'} OR email ILIKE ${'%' + query + '%'}
      `
      totalUsers = countResult[0].total
    } else if (typeFilter !== 'all') {
      // Type filter only
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        WHERE user_type = ${typeFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
        WHERE user_type = ${typeFilter}
      `
      totalUsers = countResult[0].total
    } else if (statusFilter !== 'all') {
      // Status filter only
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        WHERE status = ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
        WHERE status = ${statusFilter}
      `
      totalUsers = countResult[0].total
    } else {
      // No filters - get all users
      users = await sql`
        SELECT id, email, full_name, phone, user_type, status, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      const countResult = await sql`
        SELECT COUNT(*) as total
        FROM users
      `
      totalUsers = countResult[0].total
    }

    console.log('[ADMIN USERS] Found', users.length, 'users, total:', totalUsers)

    return NextResponse.json({
      users: users,
      totalUsers,
      page,
      limit,
      totalPages: Math.ceil(totalUsers / limit),
    })
  } catch (error: any) {
    console.error('[users] Error fetching users:', error)
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
