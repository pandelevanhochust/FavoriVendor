package com.example.vietqrapp.db;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

public class KioskDbHelper extends SQLiteOpenHelper {

    private static final String DATABASE_NAME = "kiosk_local.db";
    private static final int DATABASE_VERSION = 2;

    private static KioskDbHelper instance;

    public static synchronized KioskDbHelper getInstance(Context context) {
        if (instance == null) {
            instance = new KioskDbHelper(context.getApplicationContext());
        }
        return instance;
    }

    public KioskDbHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        // Bảng giao dịch (cả Tiền mặt và Chuyển khoản)
        db.execSQL("CREATE TABLE IF NOT EXISTS kiosk_transactions (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "order_id TEXT, " +
                "type TEXT, " +
                "amount INTEGER, " +
                "unit_price INTEGER, " +
                "quantity INTEGER, " +
                "discount_code TEXT, " +
                "discount_amount INTEGER, " +
                "status TEXT, " +
                "created_at INTEGER, " +
                "bank_txn_id TEXT, " +
                "bank_account TEXT, " +
                "content TEXT, " +
                "reference_number TEXT)");

        // Bảng mã giảm giá
        db.execSQL("CREATE TABLE IF NOT EXISTS kiosk_discounts (" +
                "code TEXT PRIMARY KEY, " +
                "description TEXT, " +
                "type TEXT, " +
                "value INTEGER, " +
                "min_order_amount INTEGER, " +
                "max_discount_amount INTEGER, " +
                "is_active INTEGER, " +
                "expires_at INTEGER DEFAULT 0)");

    }

    private void seedDiscount(SQLiteDatabase db, String code, String desc, String type, long val, long minOrder, long maxDisc, int active, long expiresAt) {
        ContentValues cv = new ContentValues();
        cv.put("code", code);
        cv.put("description", desc);
        cv.put("type", type);
        cv.put("value", val);
        cv.put("min_order_amount", minOrder);
        cv.put("max_discount_amount", maxDisc);
        cv.put("is_active", active);
        cv.put("expires_at", expiresAt);
        db.insertWithOnConflict("kiosk_discounts", null, cv, SQLiteDatabase.CONFLICT_IGNORE);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            try {
                db.execSQL("ALTER TABLE kiosk_discounts ADD COLUMN expires_at INTEGER DEFAULT 0");
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onOpen(SQLiteDatabase db) {
        super.onOpen(db);
        // Đảm bảo cột expires_at luôn tồn tại ngay cả khi chưa upgrade version
        try {
            db.execSQL("ALTER TABLE kiosk_discounts ADD COLUMN expires_at INTEGER DEFAULT 0");
        } catch (Exception ignored) {}
    }

    // ========================================== Giao dịch (Transactions) ==========================================

    public synchronized long insertTransaction(LocalTransaction tx) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("order_id", tx.orderId);
        cv.put("type", tx.type);
        cv.put("amount", tx.amount);
        cv.put("unit_price", tx.unitPrice);
        cv.put("quantity", tx.quantity);
        cv.put("discount_code", tx.discountCode);
        cv.put("discount_amount", tx.discountAmount);
        cv.put("status", tx.status != null ? tx.status : "PAID");
        cv.put("created_at", tx.createdAt > 0 ? tx.createdAt : System.currentTimeMillis());
        cv.put("bank_txn_id", tx.bankTxnId);
        cv.put("bank_account", tx.bankAccount);
        cv.put("content", tx.content);
        cv.put("reference_number", tx.referenceNumber);
        return db.insert("kiosk_transactions", null, cv);
    }

    public synchronized List<LocalTransaction> getRecentTransactions(int limit) {
        List<LocalTransaction> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT * FROM kiosk_transactions ORDER BY created_at DESC LIMIT ?",
                new String[]{String.valueOf(limit)});
        if (c != null) {
            try {
                while (c.moveToNext()) {
                    LocalTransaction t = new LocalTransaction();
                    t.id = c.getLong(c.getColumnIndexOrThrow("id"));
                    t.orderId = c.getString(c.getColumnIndexOrThrow("order_id"));
                    t.type = c.getString(c.getColumnIndexOrThrow("type"));
                    t.amount = c.getLong(c.getColumnIndexOrThrow("amount"));
                    t.unitPrice = c.getLong(c.getColumnIndexOrThrow("unit_price"));
                    t.quantity = c.getInt(c.getColumnIndexOrThrow("quantity"));
                    t.discountCode = c.getString(c.getColumnIndexOrThrow("discount_code"));
                    t.discountAmount = c.getLong(c.getColumnIndexOrThrow("discount_amount"));
                    t.status = c.getString(c.getColumnIndexOrThrow("status"));
                    t.createdAt = c.getLong(c.getColumnIndexOrThrow("created_at"));
                    t.bankTxnId = c.getString(c.getColumnIndexOrThrow("bank_txn_id"));
                    t.bankAccount = c.getString(c.getColumnIndexOrThrow("bank_account"));
                    t.content = c.getString(c.getColumnIndexOrThrow("content"));
                    t.referenceNumber = c.getString(c.getColumnIndexOrThrow("reference_number"));
                    list.add(t);
                }
            } finally {
                c.close();
            }
        }
        return list;
    }

    // ========================================== Mã giảm giá (Discounts) ==========================================

    private LocalDiscount readDiscountCursor(Cursor c) {
        LocalDiscount d = new LocalDiscount();
        d.code = c.getString(c.getColumnIndexOrThrow("code"));
        d.description = c.getString(c.getColumnIndexOrThrow("description"));
        d.type = c.getString(c.getColumnIndexOrThrow("type"));
        d.value = c.getLong(c.getColumnIndexOrThrow("value"));
        d.minOrderAmount = c.getLong(c.getColumnIndexOrThrow("min_order_amount"));
        d.maxDiscountAmount = c.getLong(c.getColumnIndexOrThrow("max_discount_amount"));
        d.isActive = c.getInt(c.getColumnIndexOrThrow("is_active")) == 1;
        int expCol = c.getColumnIndex("expires_at");
        d.expiresAt = (expCol >= 0 && !c.isNull(expCol)) ? c.getLong(expCol) : 0;
        return d;
    }

    public synchronized long insertOrUpdateDiscount(LocalDiscount d) {
        if (d == null || d.code == null || d.code.trim().isEmpty()) return -1;
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("code", d.code.trim().toUpperCase());
        cv.put("description", d.description != null ? d.description.trim() : "");
        cv.put("type", d.type != null ? d.type.trim() : "PERCENT");
        cv.put("value", d.value);
        cv.put("min_order_amount", d.minOrderAmount);
        cv.put("max_discount_amount", d.maxDiscountAmount);
        cv.put("is_active", d.isActive ? 1 : 0);
        cv.put("expires_at", d.expiresAt);
        return db.insertWithOnConflict("kiosk_discounts", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public synchronized LocalDiscount getDiscount(String code) {
        if (code == null || code.trim().isEmpty()) return null;
        SQLiteDatabase db = getReadableDatabase();
        long now = System.currentTimeMillis();
        Cursor c = db.rawQuery("SELECT * FROM kiosk_discounts WHERE UPPER(code) = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at = 0 OR expires_at >= ?)",
                new String[]{code.trim().toUpperCase(), String.valueOf(now)});
        if (c != null) {
            try {
                if (c.moveToFirst()) {
                    return readDiscountCursor(c);
                }
            } finally {
                c.close();
            }
        }
        return null;
    }

    /** Lấy danh sách các mã giảm giá còn hiệu lực (chưa expired và đang active) */
    public synchronized List<LocalDiscount> getUnexpiredDiscounts() {
        List<LocalDiscount> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        long now = System.currentTimeMillis();
        Cursor c = db.rawQuery("SELECT * FROM kiosk_discounts WHERE is_active = 1 AND (expires_at IS NULL OR expires_at = 0 OR expires_at >= ?) ORDER BY code ASC",
                new String[]{String.valueOf(now)});
        if (c != null) {
            try {
                while (c.moveToNext()) {
                    list.add(readDiscountCursor(c));
                }
            } finally {
                c.close();
            }
        }
        return list;
    }

    public synchronized List<LocalDiscount> getAllDiscounts() {
        List<LocalDiscount> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT * FROM kiosk_discounts ORDER BY code ASC", null);
        if (c != null) {
            try {
                while (c.moveToNext()) {
                    list.add(readDiscountCursor(c));
                }
            } finally {
                c.close();
            }
        }
        return list;
    }

    public synchronized int deleteDiscount(String code) {
        if (code == null || code.trim().isEmpty()) return 0;
        SQLiteDatabase db = getWritableDatabase();
        return db.delete("kiosk_discounts", "UPPER(code) = ?", new String[]{code.trim().toUpperCase()});
    }

    /** Tính số tiền giảm giá từ LocalDiscount */
    public static long calculateDiscount(LocalDiscount d, long orderAmount) {
        if (d == null || !d.isActive) return 0;
        if (d.isExpired()) return 0;
        if (d.minOrderAmount > 0 && orderAmount < d.minOrderAmount) return 0;

        long discount = 0;
        if ("PERCENT".equalsIgnoreCase(d.type) || "PERCENTAGE".equalsIgnoreCase(d.type)) {
            discount = (orderAmount * d.value) / 100;
            if (d.maxDiscountAmount > 0 && discount > d.maxDiscountAmount) {
                discount = d.maxDiscountAmount;
            }
        } else if ("FIXED_AMOUNT".equalsIgnoreCase(d.type) || "FIXEDAMOUNT".equalsIgnoreCase(d.type) || "FIXED".equalsIgnoreCase(d.type)) {
            discount = Math.min(d.value, orderAmount);
        }
        return discount;
    }
}
