// Named-pipe stream (Windows). Overlapped I/O throughout: a client's pipe is read by its serve
// thread while broadcasts write to it from others, and synchronous handles would serialise
// the two (a write would wait behind the blocked read).
#include <windows.h>
#include <sddl.h>

#include <atomic>
#include <stdexcept>

#include "ipc.h"
#include "platform/win_util.h"

namespace ipc {

namespace {

class PipeConn : public Conn {
  public:
    explicit PipeConn(HANDLE h) : h_(h) {
        rev_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        wev_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    }
    ~PipeConn() override {
        CloseHandle(h_);
        CloseHandle(rev_);
        CloseHandle(wev_);
    }
    int recv(char* buf, size_t len) override {
        if (closed_) return -1;
        OVERLAPPED ov{};
        ov.hEvent = rev_;
        ResetEvent(rev_);
        DWORD got = 0;
        if (!ReadFile(h_, buf, static_cast<DWORD>(len), &got, &ov)) {
            if (GetLastError() != ERROR_IO_PENDING) return -1;
            if (!GetOverlappedResult(h_, &ov, &got, TRUE)) return -1;
        }
        return closed_ ? -1 : static_cast<int>(got);
    }
    bool send(const std::string& s) override {
        std::lock_guard<std::mutex> lk(wm_);
        size_t off = 0;
        while (off < s.size()) {
            if (closed_) return false;
            OVERLAPPED ov{};
            ov.hEvent = wev_;
            ResetEvent(wev_);
            DWORD put = 0;
            if (!WriteFile(h_, s.data() + off, static_cast<DWORD>(s.size() - off), &put, &ov)) {
                if (GetLastError() != ERROR_IO_PENDING) return false;
                if (!GetOverlappedResult(h_, &ov, &put, TRUE)) return false;
            }
            if (!put) return false;
            off += put;
        }
        return true;
    }
    void close() override {
        closed_ = true;
        CancelIoEx(h_, nullptr);
    }

  private:
    HANDLE h_, rev_, wev_;
    std::mutex wm_;
    std::atomic<bool> closed_{false};
};

// only this user (and the system) may open the pipe
class Security {
  public:
    Security() {
        HANDLE tok = nullptr;
        std::wstring sid;
        if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &tok)) {
            DWORD n = 0;
            GetTokenInformation(tok, TokenUser, nullptr, 0, &n);
            std::string buf(n, '\0');
            if (n && GetTokenInformation(tok, TokenUser, buf.data(), n, &n)) {
                LPWSTR s = nullptr;
                if (ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(buf.data())->User.Sid, &s)) { sid = s; LocalFree(s); }
            }
            CloseHandle(tok);
        }
        std::wstring sddl = L"D:P(A;;GA;;;SY)" + (sid.empty() ? std::wstring(L"(A;;GA;;;OW)") : L"(A;;GA;;;" + sid + L")");
        sa_.nLength = sizeof(sa_);
        sa_.bInheritHandle = FALSE;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(), SDDL_REVISION_1, &sa_.lpSecurityDescriptor, nullptr))
            sa_.lpSecurityDescriptor = nullptr;
    }
    ~Security() { if (sa_.lpSecurityDescriptor) LocalFree(sa_.lpSecurityDescriptor); }
    SECURITY_ATTRIBUTES* get() { return sa_.lpSecurityDescriptor ? &sa_ : nullptr; }

  private:
    SECURITY_ATTRIBUTES sa_{};
};

class PipeListener : public Listener {
  public:
    explicit PipeListener(const std::string& path) : name_(platform::wide(path)) {
        ev_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        if (!createInstance()) {
            DWORD e = GetLastError();
            CloseHandle(ev_);
            throw std::runtime_error(e == ERROR_ACCESS_DENIED ? "another LogiMX agent is already running" : "cannot create pipe " + path);
        }
    }
    ~PipeListener() override {
        if (pending_ != INVALID_HANDLE_VALUE) {
            CancelIoEx(pending_, nullptr);
            CloseHandle(pending_);
        }
        CloseHandle(ev_);
    }
    std::shared_ptr<Conn> accept(int timeoutMs) override {
        if (pending_ == INVALID_HANDLE_VALUE && !createInstance()) { Sleep(timeoutMs); return nullptr; }
        if (!connecting_) {
            ResetEvent(ev_);
            ov_ = OVERLAPPED{};
            ov_.hEvent = ev_;
            BOOL r = ConnectNamedPipe(pending_, &ov_);
            DWORD e = GetLastError();
            if (r || e == ERROR_PIPE_CONNECTED) return handOver();
            if (e != ERROR_IO_PENDING) { drop(); return nullptr; }
            connecting_ = true;
        }
        if (WaitForSingleObject(ev_, static_cast<DWORD>(timeoutMs)) != WAIT_OBJECT_0) return nullptr;
        connecting_ = false;
        DWORD x = 0;
        if (!GetOverlappedResult(pending_, &ov_, &x, FALSE)) { drop(); return nullptr; }
        return handOver();
    }

  private:
    bool createInstance() {
        DWORD open = PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | (first_ ? FILE_FLAG_FIRST_PIPE_INSTANCE : 0);
        pending_ = CreateNamedPipeW(name_.c_str(), open, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                                    PIPE_UNLIMITED_INSTANCES, 65536, 65536, 0, sec_.get());
        if (pending_ == INVALID_HANDLE_VALUE) return false;
        first_ = false;
        return true;
    }
    void drop() {
        connecting_ = false;
        CloseHandle(pending_);
        pending_ = INVALID_HANDLE_VALUE;
    }
    std::shared_ptr<Conn> handOver() {
        auto c = std::make_shared<PipeConn>(pending_);
        pending_ = INVALID_HANDLE_VALUE;
        createInstance();   // keep an instance listening so the name stays ours
        return c;
    }
    std::wstring name_;
    Security sec_;
    HANDLE pending_ = INVALID_HANDLE_VALUE, ev_ = nullptr;
    OVERLAPPED ov_{};
    bool connecting_ = false, first_ = true;
};

}  // namespace

std::unique_ptr<Listener> Listener::create(const std::string& path) { return std::make_unique<PipeListener>(path); }

std::shared_ptr<Conn> connect(const std::string& path) {
    std::wstring name = platform::wide(path);
    for (int attempt = 0; attempt < 5; ++attempt) {
        HANDLE h = CreateFileW(name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr);
        if (h != INVALID_HANDLE_VALUE) return std::make_shared<PipeConn>(h);
        if (GetLastError() != ERROR_PIPE_BUSY) break;
        WaitNamedPipeW(name.c_str(), 500);
    }
    throw std::runtime_error("agent not running (" + path + ")");
}

}  // namespace ipc
