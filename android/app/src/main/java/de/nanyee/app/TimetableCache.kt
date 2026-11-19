package de.nanyee.app

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

@Serializable
data class CachedTimetable(
    val courses: List<JsonObject>,
    val updatedAt: String,
    val totalWeeks: Int,
    val semesterStart: String = ""
)

@Serializable
data class TimetableSnapshot(
    val owner: String,
    val semesters: List<JsonObject>,
    val selectedSemester: String,
    val tables: Map<String, CachedTimetable>,
    val version: Int = 1
)

internal data class CachedTimetableView(val semester: String, val week: Int, val userPickedWeek: Boolean)

internal fun TimetableSnapshot.restoreView(view: CachedTimetableView?, savedView: CachedTimetableView? = null): CachedTimetableView {
    val preferred = view ?: savedView?.takeIf { it.userPickedWeek && it.semester in tables }
    val code = preferred?.semester?.takeIf { it in tables } ?: selectedSemester
    val table = tables.getValue(code)
    return if (preferred?.semester == code) preferred.copy(week = preferred.week.coerceIn(1, table.totalWeeks))
    else CachedTimetableView(code, 1, false)
}

internal object TimetableCacheCodec {
    private val json = Json { ignoreUnknownKeys = true }
    private val courseKeys = setOf("course_id", "name", "weekday", "start_node", "end_node", "start_time", "end_time", "location", "teachers", "weeks", "activity", "credit_hours")

    fun encode(value: TimetableSnapshot): String {
        val clean = value.copy(
            semesters = value.semesters.map { payload("code" to it.text("code"), "label" to it.text("label")) },
            tables = value.tables.mapValues { (_, table) -> table.copy(courses = table.courses.map { course ->
                JsonObject(course.filterKeys { it in courseKeys }.filterValues { field -> field is JsonPrimitive || field is JsonArray && field.all { it is JsonPrimitive } })
            }) }
        )
        return json.encodeToString(clean)
    }

    fun decode(value: String): TimetableSnapshot {
        val result = json.decodeFromString<TimetableSnapshot>(value)
        require(result.version == 1 && result.owner.isNotBlank())
        require(result.tables.isNotEmpty() && result.selectedSemester in result.tables)
        require(result.tables.all { (code, table) -> code.matches(Regex("\\d{6}")) && table.totalWeeks in 1..30 && runCatching { Instant.parse(table.updatedAt) }.isSuccess })
        return result
    }
}

internal interface TimetableCacheStorage {
    fun read(): String?
    fun write(value: String?)
}

internal class TimetableCacheStore(private val storage: TimetableCacheStorage) {
    fun load(): TimetableSnapshot? = storage.read()?.let { TimetableCacheCodec.decode(it) }
    fun save(value: TimetableSnapshot) = storage.write(TimetableCacheCodec.encode(value))
    fun clear() = storage.write(null)
}

internal interface CacheRevocation {
    fun isRevoked(): Boolean
    fun setRevoked(value: Boolean)
}

internal class RevocableTimetableCache(private val store: () -> TimetableCacheStore, private val revocation: CacheRevocation) {
    private var revokedInMemory = false

    fun retryRevokedDeletion(): Boolean {
        if (!revokedInMemory && !revocation.isRevoked()) return true
        revokedInMemory = true
        return runCatching {
            store().clear()
            revocation.setRevoked(false)
            revokedInMemory = false
        }.isSuccess
    }

    fun load(): TimetableSnapshot? {
        if (revokedInMemory || revocation.isRevoked()) { retryRevokedDeletion(); return null }
        return store().load()
    }

    fun save(value: TimetableSnapshot) {
        check(retryRevokedDeletion()) { "本机课表撤销尚未完成" }
        store().save(value)
    }

    fun clear(): Boolean {
        revokedInMemory = true
        revocation.setRevoked(true)
        return retryRevokedDeletion()
    }
}

internal class EncryptedTimetableStorage(context: Context) : TimetableCacheStorage {
    private val preferences = EncryptedSharedPreferences.create(
        context, "school_timetable", MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    override fun read(): String? = preferences.getString("snapshot", null)
    override fun write(value: String?) {
        val editor = preferences.edit()
        if (value == null) editor.remove("snapshot") else editor.putString("snapshot", value)
        check(editor.commit()) { "无法保存本机课表" }
    }
}
