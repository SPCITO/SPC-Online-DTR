"""
SPC Online DTR — Log Source User Manual (Both / Summary, Online DTR, Biometrics)
Professional PDF generator.

Image policy (important): every screenshot is placed at its true aspect
ratio, scaled to FIT inside its figure box ("contain"), centered on the
white page. Images are never cropped, stretched, or padded with dark
bars — any leftover space stays white.
"""

from fpdf import FPDF
from PIL import Image
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(BASE, "screenshots")
LOGO = os.path.join(BASE, "..", "..", "frontend", "public", "spc logo.png")
OUT = os.path.join(BASE, "SPC-Online-DTR-Log-Source-User-Manual.pdf")

# SPC brand colors
GREEN = (4, 120, 87)
DARK = (15, 23, 42)
GRAY = (100, 116, 139)
LIGHT = (226, 232, 240)
TEXT = (45, 52, 62)
WHITE = (255, 255, 255)
AMBER = (180, 120, 20)
ROSE = (190, 60, 80)

# Page geometry (US Letter, mm)
PW = 215.9
PH = 279.4
LM = 22
RM = 22
TM = 20
BM = 20
CW = PW - LM - RM  # 171.9 mm content width


class Manual(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "Letter")
        self.set_margins(LM, TM, RM)
        self.set_auto_page_break(auto=False)
        self._is_cover = False

    # ---------- chrome ----------
    def header(self):
        if self.page_no() > 1 and not self._is_cover:
            self.set_draw_color(*GREEN)
            self.set_line_width(0.5)
            self.line(LM, 12, PW - RM, 12)
            self.set_xy(LM, 4)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*GRAY)
            self.cell(CW, 5, "SPC Online DTR  |  Log Source User Manual", align="R")

    def footer(self):
        if self.page_no() > 1 and not self._is_cover:
            self.set_draw_color(*LIGHT)
            self.set_line_width(0.3)
            fy = PH - 14
            self.line(LM, fy, PW - RM, fy)
            self.set_xy(LM, fy + 1)
            self.set_font("Helvetica", "", 8)
            self.set_text_color(*GRAY)
            self.cell(CW, 6, f"Page {self.page_no() - 1}", align="C")

    def content_top(self):
        return 18

    def content_bottom(self):
        return PH - 18

    def fits(self, h):
        return self.get_y() + h <= self.content_bottom()

    def new_page_if_needed(self, h):
        if not self.fits(h):
            self.add_page()
            self.set_y(self.content_top())

    # ---------- text blocks ----------
    def green_bar(self, w=35):
        self.set_fill_color(*GREEN)
        self.rect(LM, self.get_y(), w, 1, "F")
        self.ln(5)

    def h1(self, text):
        self.new_page_if_needed(22)
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(*DARK)
        self.cell(CW, 10, text, new_x="LMARGIN", new_y="NEXT")
        self.green_bar()
        self.ln(2)

    def h2(self, text):
        self.new_page_if_needed(14)
        self.ln(3)
        self.set_font("Helvetica", "B", 13.5)
        self.set_text_color(*GREEN)
        self.cell(CW, 8, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def h3(self, text):
        self.new_page_if_needed(11)
        self.ln(1.5)
        self.set_font("Helvetica", "B", 11.5)
        self.set_text_color(*DARK)
        self.cell(CW, 7, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(0.5)

    def para(self, text):
        self.new_page_if_needed(10)
        self.set_font("Helvetica", "", 10.5)
        self.set_text_color(*TEXT)
        self.multi_cell(CW, 5.6, text)
        self.ln(1.5)

    def bold_para(self, text):
        self.new_page_if_needed(10)
        self.set_font("Helvetica", "B", 10.5)
        self.set_text_color(*TEXT)
        self.multi_cell(CW, 5.6, text)
        self.ln(1.5)

    def bullet(self, text, bold_lead=None):
        self.new_page_if_needed(9)
        y = self.get_y()
        self.set_font("Helvetica", "", 10.5)
        self.set_text_color(*GREEN)
        self.set_xy(LM + 1, y)
        self.cell(5, 5.6, ">")
        self.set_xy(LM + 6, y)
        self.set_text_color(*TEXT)
        if bold_lead:
            self.set_font("Helvetica", "B", 10.5)
            lead_w = self.get_string_width(bold_lead) + 0.8
            self.cell(lead_w, 5.6, bold_lead)
            self.set_font("Helvetica", "", 10.5)
            avail = CW - 6 - lead_w
            self.multi_cell(avail, 5.6, text)
        else:
            self.multi_cell(CW - 6, 5.6, text)
        self.ln(1)

    def note(self, text):
        self.new_page_if_needed(16)
        y = self.get_y()
        self.set_fill_color(238, 247, 243)
        self.set_draw_color(*GREEN)
        self.set_line_width(0.3)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*TEXT)
        inner_h = self.multi_cell(CW - 12, 5.2, text, dry_run=True, output="HEIGHT")
        h = inner_h + 6
        if not self.fits(h):
            self.add_page()
            self.set_y(self.content_top())
            y = self.get_y()
        self.rect(LM, y, CW, h, "DF")
        self.set_xy(LM + 6, y + 3)
        self.multi_cell(CW - 12, 5.2, text)
        self.set_y(y + h + 3)

    def key_table(self, rows, key_w=52):
        """Two-column key/meaning table with soft rules."""
        for i, (key, meaning) in enumerate(rows):
            self.new_page_if_needed(12)
            y = self.get_y()
            self.set_font("Helvetica", "B", 10)
            kh = self.multi_cell(key_w - 4, 5.2, key, dry_run=True, output="HEIGHT")
            self.set_font("Helvetica", "", 10)
            mh = self.multi_cell(CW - key_w - 2, 5.2, meaning, dry_run=True, output="HEIGHT")
            h = max(kh, mh) + 3
            if not self.fits(h):
                self.add_page()
                self.set_y(self.content_top())
                y = self.get_y()
            if i % 2 == 0:
                self.set_fill_color(248, 250, 252)
                self.rect(LM, y, CW, h, "F")
            self.set_xy(LM + 2, y + 1.5)
            self.set_font("Helvetica", "B", 10)
            self.set_text_color(*GREEN)
            self.multi_cell(key_w - 4, 5.2, key)
            self.set_xy(LM + key_w, y + 1.5)
            self.set_font("Helvetica", "", 10)
            self.set_text_color(*TEXT)
            self.multi_cell(CW - key_w - 2, 5.2, meaning)
            self.set_draw_color(*LIGHT)
            self.set_line_width(0.2)
            self.line(LM, y + h, LM + CW, y + h)
            self.set_y(y + h)

    # ---------- figures ----------
    def figure(self, img_name, caption, max_h=None):
        """
        Place a screenshot scaled to FIT (never cropped, never stretched),
        centered horizontally on the white page, caption underneath.
        The figure keeps its natural size and flows to a new page when it
        cannot fit; it is only scaled down when a page cannot hold it at all.
        """
        path = os.path.join(SHOTS, img_name)
        iw, ih = Image.open(path).size
        ratio = ih / iw  # height per unit width

        caption_h = 12
        w = CW
        h = w * ratio
        if max_h and h > max_h:
            h = max_h
            w = h / ratio

        need = h + caption_h + 2
        if not self.fits(need):
            if self.get_y() > self.content_top() + 5:
                self.add_page()
                self.set_y(self.content_top())
            if not self.fits(need):
                room = self.content_bottom() - self.get_y() - caption_h
                h = max(room, 20)
                w = h / ratio

        x = LM + (CW - w) / 2
        y = self.get_y() + 1

        # Thin frame so the white screenshot edge is visible on white paper.
        self.set_draw_color(*LIGHT)
        self.set_line_width(0.2)
        self.rect(x, y, w, h)
        self.image(path, x=x, y=y, w=w)  # width only -> aspect ratio preserved

        self.set_y(y + h + 1.5)
        self.set_font("Helvetica", "I", 8.5)
        self.set_text_color(*GRAY)
        self.multi_cell(CW, 4.6, caption, align="C")
        self.ln(3)

    def figure_pair(self, left, left_cap, right, right_cap):
        """Two screenshots side by side (e.g. phone screens), scaled equally."""
        gap = 8
        col_w = (CW - gap) / 2
        caption_h = 14

        items = []
        for img, cap in ((left, left_cap), (right, right_cap)):
            iw, ih = Image.open(os.path.join(SHOTS, img)).size
            ratio = ih / iw
            w = col_w
            h = w * ratio
            items.append([img, cap, w, h, ratio])

        h = max(i[3] for i in items)
        need = h + caption_h + 2
        if not self.fits(need):
            if self.get_y() > self.content_top() + 5:
                self.add_page()
                self.set_y(self.content_top())
            if not self.fits(need):
                room = self.content_bottom() - self.get_y() - caption_h
                scale = room / h
                h = max(room, 20)
                for it in items:
                    it[2] *= scale
                    it[3] *= scale

        y = self.get_y() + 1
        for i, (img, cap, w, h_i, ratio) in enumerate(items):
            x = LM + i * (col_w + gap) + (col_w - w) / 2
            self.set_draw_color(*LIGHT)
            self.set_line_width(0.2)
            self.rect(x, y, w, h_i)
            self.image(os.path.join(SHOTS, img), x=x, y=y, w=w)
            self.set_xy(LM + i * (col_w + gap), y + h + 1.5)
            self.set_font("Helvetica", "I", 8.5)
            self.set_text_color(*GRAY)
            self.multi_cell(col_w, 4.6, cap, align="C")
        self.set_y(y + h + caption_h)
        self.ln(2)


pdf = Manual()

# ============================================================
# COVER
# ============================================================
pdf.add_page()
pdf._is_cover = True

# Green header band
pdf.set_fill_color(*GREEN)
pdf.rect(0, 0, PW, 38, "F")
pdf.set_fill_color(46, 148, 112)
pdf.rect(0, 38, PW, 3, "F")

pdf.set_xy(0, 13)
pdf.set_font("Helvetica", "B", 15)
pdf.set_text_color(*WHITE)
pdf.cell(PW, 8, "SAN PABLO COLLEGES", align="C")

if os.path.exists(LOGO):
    lw = 42
    lh = lw  # square logo
    pdf.image(LOGO, x=(PW - lw) / 2, y=52, w=lw)

pdf.set_y(100)
pdf.set_font("Helvetica", "B", 24)
pdf.set_text_color(*DARK)
pdf.multi_cell(CW, 11, "SPC Online DTR", align="C")
pdf.ln(1)
pdf.set_font("Helvetica", "B", 15.5)
pdf.set_text_color(*GREEN)
pdf.multi_cell(CW, 8, "User Manual: The Log Source Selector", align="C")
pdf.ln(2)
pdf.set_font("Helvetica", "", 12.5)
pdf.set_text_color(*TEXT)
pdf.multi_cell(
    CW,
    6.5,
    "How to view Both / Summary, Online DTR, and Biometrics\nattendance records in your user dashboard",
    align="C",
)

pdf.ln(6)
chip_y = pdf.get_y()
labels = ["Both / Summary", "Online DTR", "Biometrics"]
pdf.set_font("Helvetica", "B", 10.5)
chip_w = 46
gap = 8
total = chip_w * 3 + gap * 2
cx = (PW - total) / 2
for i, lab in enumerate(labels):
    x = cx + i * (chip_w + gap)
    pdf.set_fill_color(*GREEN)
    pdf.rect(x, chip_y, chip_w, 11, "F")
    pdf.set_xy(x, chip_y + 2.6)
    pdf.set_text_color(*WHITE)
    pdf.cell(chip_w, 6, lab, align="C")

pdf.set_y(chip_y + 34)
pdf.set_font("Helvetica", "", 10.5)
pdf.set_text_color(*GRAY)
pdf.multi_cell(
    CW,
    5.6,
    "Audience: All employees using the SPC Online DTR user dashboard\n"
    "Feature: Attendance Log Source selector (Both / Summary | Online DTR | Biometrics)\n"
    "Pages covered: My Attendance Logs and Monthly Attendance\n"
    "Issued: October 2026",
    align="C",
)

pdf.set_draw_color(*LIGHT)
pdf.set_line_width(0.3)
pdf.line(LM, PH - 42, PW - RM, PH - 42)
pdf.set_xy(LM, PH - 38)
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(*GRAY)
pdf.multi_cell(CW, 5, "San Pablo Colleges - SPC Online DTR System", align="C")

pdf._is_cover = False

# ============================================================
# CONTENTS
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("Contents")
pdf.ln(2)
toc = [
    ("1.", "About This Feature"),
    ("2.", "The Log Source Selector - Where to Find It"),
    ("3.", "My Attendance Logs - The Three Views"),
    ("4.", "Both / Summary - Understanding the Status Badges"),
    ("5.", "Monthly Attendance - The Three Views"),
    ("6.", "Using the Feature on a Phone"),
    ("7.", "Good to Know - Tips and Questions"),
]
for num, title in toc:
    y = pdf.get_y()
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*GREEN)
    pdf.set_xy(LM + 2, y)
    pdf.cell(12, 7, num)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*TEXT)
    pdf.cell(CW - 14, 7, title)
    pdf.ln(8)

# ============================================================
# 1. ABOUT THIS FEATURE
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("1. About This Feature")

pdf.para(
    "Your attendance is recorded in two places: the SPC Online DTR (when you use "
    "the Time In / Time Out buttons of this system) and the biometric device at "
    "school (when you log your fingerprint). Until now, each dashboard page showed "
    "only one of these sources at a time."
)
pdf.para(
    "The new Log Source selector lets you choose, at any moment, which records "
    "you want to see. It is available on the two pages you use most:"
)
pdf.bullet("shows your complete day-by-day attendance records and sessions.", bold_lead="My Attendance Logs - ")
pdf.bullet("shows your monthly totals and your attendance calendar.", bold_lead="Monthly Attendance - ")
pdf.para(
    "You can switch between Both / Summary, Online DTR, and Biometrics without "
    "leaving the page - the table or summary updates immediately."
)

pdf.figure(
    "01-dashboard-home.png",
    "Figure 1 - Your dashboard home. Use View My Logs to open My Attendance Logs, "
    "or Monthly Summary to open Monthly Attendance. Both pages contain the Log Source selector.",
    max_h=150,
)

# ============================================================
# 2. THE SELECTOR
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("2. The Log Source Selector - Where to Find It")

pdf.h2("2.1 On the My Attendance Logs page")
pdf.para(
    "Open My Attendance Logs from the dashboard. Scroll down to the Employee Log "
    "Records panel: the Log Source control sits just below the panel heading, above "
    "the records table (Figure 2)."
)

pdf.figure(
    "03-logs-online-view.png",
    "Figure 2 - My Attendance Logs: the Log Source selector above the records table "
    "(here, Online DTR is selected).",
)

pdf.h2("2.2 On the Monthly Attendance page")
pdf.para(
    "Open Monthly Attendance from the dashboard. The Log Source control is in the "
    "page header, right under the page title (Figure 8)."
)

pdf.h2("2.3 The three options")
pdf.key_table(
    [
        (
            "Both / Summary",
            "One row per attendance day showing your Online DTR sessions and your "
            "Biometric punches side by side, with a Status that compares the two "
            "sources. Best for checking whether both systems agree.",
        ),
        (
            "Online DTR",
            "Only the sessions recorded through the SPC Online DTR (Time In / Time "
            "Out). Best for reviewing your web-recorded attendance.",
        ),
        (
            "Biometrics",
            "Only the punches recorded by the biometric device. Best for verifying "
            "what the device registered for you.",
        ),
    ],
    key_w=44,
)

pdf.ln(3)
pdf.h2("2.4 Desktop and phone")
pdf.bullet(
    "the three options appear as buttons. The selected option is highlighted in green.",
    bold_lead="On a computer: ",
)
pdf.bullet(
    "the same three options appear in a Log Source dropdown list (Figures 12 and 13).",
    bold_lead="On a phone: ",
)
pdf.bullet(
    "Online DTR is always selected first. Your choice stays active while you remain on the page.",
    bold_lead="Default: ",
)

pdf.note(
    "Tip: the selector is different on each page. Choosing Biometrics on My "
    "Attendance Logs does not change the Monthly Attendance page - set the source "
    "you want on each page separately."
)

# ============================================================
# 3. MY ATTENDANCE LOGS
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("3. My Attendance Logs - The Three Views")

pdf.para(
    "Above the records table you always see three summary cards: Total Logs, "
    "Latest Date, and Status Tracking. Total Logs and Latest Date describe the "
    "records currently listed in the table below them:"
)
pdf.bullet(
    "Online DTR and Biometrics list individual sessions, so Total Logs counts "
    "the sessions currently listed - not your entire attendance history.",
    bold_lead="In the source views: ",
)
pdf.bullet(
    "the table lists one row per attendance day, so Total Logs counts the days "
    "currently listed - a day with several sessions is still counted once.",
    bold_lead="In Both / Summary: ",
)
pdf.bullet(
    "shows the newest date among the records listed. Status Tracking is a fixed "
    "label on its card - it does not calculate anything from your data.",
    bold_lead="Latest Date: ",
)

pdf.h2("3.1 Online DTR view")
pdf.para(
    "Figure 3 shows the Online DTR view. Every row is one session recorded through "
    "this system, with its Date, Time In, Time Out, and Status."
)
pdf.key_table(
    [
        (
            "Completed",
            "The session has both a Time In and a Time Out. This includes sessions "
            "the system closed automatically after a forgotten Time Out - in the "
            "Monthly Attendance day details those show as Auto-closed or Corrected "
            "(fixed by an administrator).",
        ),
        ("Active", "The session is still open - you have timed in but not yet timed out."),
        (
            "No Time Out",
            "The session ran past the allowed window without a Time Out. The row "
            "stays visible for that day - with a blank Time Out and a No Time Out "
            "badge - but no hours are credited; if this happens, file a DTR "
            "Correction Form with HR.",
        ),
    ],
    key_w=36,
)
pdf.ln(2)
pdf.figure(
    "02-logs-online-full.png",
    "Figure 3 - My Attendance Logs, Online DTR view (complete page).",
    max_h=225,
)

pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h2("3.2 Biometrics view")
pdf.para(
    "Figure 4 shows the same page in Biometrics view. The columns are the same, "
    "but every row is now a punch recorded by the biometric device. Biometric data "
    "is read-only: it is displayed exactly as the device recorded it. A punch without "
    "a Time Out is shown as No Time Out."
)
pdf.figure(
    "05-logs-biometrics-view.png",
    "Figure 4 - My Attendance Logs, Biometrics view (on-screen view).",
)
pdf.figure(
    "04-logs-biometrics-full.png",
    "Figure 5 - My Attendance Logs, Biometrics view (complete page).",
    max_h=215,
)

pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h2("3.3 Both / Summary view")
pdf.para(
    "Figure 6 shows the Both / Summary view. One row per attendance day, with the "
    "Online DTR sessions in one column and the Biometric sessions in the other. "
    "Multiple sessions on a day are listed one per line as time in -> time out. "
    "The Status column compares the two sources for that day (see section 4)."
)
pdf.para(
    "The two sources are never merged into a single invented session: every original "
    "record is kept exactly as each system recorded it."
)
pdf.figure(
    "07-logs-both-view.png",
    "Figure 6 - My Attendance Logs, Both / Summary view (on-screen view).",
)
pdf.figure(
    "06-logs-both-full.png",
    "Figure 7 - My Attendance Logs, Both / Summary view (complete page), showing all "
    "status types: MATCHED, MISSING_TIMEOUT, DUPLICATE_CANDIDATE, TIME_MISMATCH, "
    "BIOMETRIC_ONLY, and ONLINE_ONLY.",
    max_h=228,
)

# ============================================================
# 4. STATUS BADGES
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("4. Both / Summary - Understanding the Status Badges")

pdf.para(
    "Each day in the Both / Summary view receives a computed comparison status. "
    "It is a review aid only - nothing is corrected or deleted behind the scenes."
)
pdf.key_table(
    [
        (
            "MATCHED",
            "One session in each source, and the Time In / Time Out values agree "
            "within 5 minutes. Your most reliable record - shown in green.",
        ),
        (
            "TIME_MISMATCH",
            "One session in each source, but the times differ by more than 5 "
            "minutes. Check which source is correct.",
        ),
        (
            "MISSING_TIMEOUT",
            "Exactly one Online DTR session and one biometric punch on that day, "
            "with at least one of them missing its Time Out. Shown in rose; the day "
            "carries no credited hours until corrected. In every other situation a "
            "missing Time Out appears as MISSING beside the session instead.",
        ),
        (
            "DUPLICATE_CANDIDATE",
            "Both sources have records that day, but not exactly one session in "
            "each - more than one session in one or both sources. The system "
            "never pairs sessions automatically just because the times are close - "
            "the day is marked for review instead. When only one source has "
            "records, the day shows ONLINE_ONLY or BIOMETRIC_ONLY instead.",
        ),
        (
            "ONLINE_ONLY",
            "Only the Online DTR has records for that day - no biometric punch exists.",
        ),
        (
            "BIOMETRIC_ONLY",
            "Only the biometric device has records for that day - no Online DTR session exists.",
        ),
    ],
    key_w=54,
)
pdf.ln(3)
pdf.note(
    "How to read the colors: green badges (MATCHED) need no action. Rose badges "
    "(MISSING_TIMEOUT) usually need a DTR Correction Form. Amber badges "
    "(TIME_MISMATCH, DUPLICATE_CANDIDATE, ONLINE_ONLY, BIOMETRIC_ONLY) are worth a "
    "quick review - if something looks wrong, contact the IT Office or HR."
)

# ============================================================
# 5. MONTHLY
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("5. Monthly Attendance - The Three Views")

pdf.para(
    "The Monthly Attendance page also has the Log Source selector, in the page "
    "header (Figure 8). Everything on the page follows the selected source: the "
    "Total Hours card, the Days Worked card, the Monthly Progress bar, and the "
    "calendar."
)
pdf.figure(
    "11-monthly-both-view.png",
    "Figure 8 - Monthly Attendance header with the Log Source selector (Both / Summary selected).",
)

pdf.para(
    "In Both / Summary mode the day is counted once - a day recorded in both "
    "systems is never counted twice - and hours are never mixed between sources. "
    "One detail to remember: the Total Hours card in this mode counts only days "
    "that have an Online DTR session. A day with only biometric punches still "
    "appears on the calendar and shows its hours when you select it, but those "
    "hours are not added to the Both / Summary Total Hours card."
)

pdf.figure(
    "08-monthly-online-full.png",
    "Figure 9 - Monthly Attendance, Online DTR view (complete page).",
    max_h=205,
)

pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.figure(
    "09-monthly-biometrics-full.png",
    "Figure 10 - Monthly Attendance, Biometrics view (complete page).",
    max_h=215,
)
pdf.figure(
    "10-monthly-both-full.png",
    "Figure 11 - Monthly Attendance, Both / Summary view (complete page).",
    max_h=215,
)

pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h2("5.1 The calendar at a glance")
pdf.key_table(
    [
        ("Green day", "A record exists for the selected source."),
        (
            "Red day",
            "A past weekday with no record for the selected source - the legend "
            "labels it Absent.",
        ),
        (
            "Orange day",
            "The session was closed automatically (auto-closed, pending) while the "
            "Online DTR view is selected - the hours are withheld until an admin "
            "reviews it. In Both / Summary the same day appears green and its "
            "hours are counted.",
        ),
        (
            "Rose day",
            "A record exists, but the Time Out is missing (No Time Out). In Both / "
            "Summary the calendar follows the Online DTR column whenever that day "
            "has one - a complete Online session with a missing biometric Time "
            "Out leaves the day green, even though the Logs page badge for that "
            "day reads MISSING_TIMEOUT.",
        ),
        (
            "Gray day",
            "No record yet for the selected source - a weekend, a future day, or "
            "today before you have timed in.",
        ),
    ],
    key_w=36,
)
pdf.ln(3)
pdf.para(
    "Use the left and right arrows to move between months, and select any day to "
    "see that day's attendance details. When you change the Log Source, any open "
    "day detail is closed and the calendar updates to the newly selected source."
)

# ============================================================
# 6. MOBILE
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("6. Using the Feature on a Phone")

pdf.para(
    "On a phone, the three buttons are replaced by a Log Source dropdown list. "
    "Tap it, choose Both / Summary, Online DTR, or Biometrics, and the page "
    "updates immediately - exactly as it does on a computer."
)

# Phone screenshots side by side (both scaled equally, aspect preserved)
pdf.figure_pair(
    "12-mobile-logs-both.png",
    "Figure 12 - My Attendance Logs on a phone (Both / Summary selected).",
    "13-mobile-monthly-both.png",
    "Figure 13 - Monthly Attendance on a phone (Both / Summary selected).",
)

# ============================================================
# 7. TIPS
# ============================================================
pdf.add_page()
pdf.set_y(pdf.content_top())
pdf.h1("7. Good to Know - Tips and Questions")

pdf.h2("Tips")
pdf.bullet("Online DTR is selected first, so the page looks familiar until you switch.", bold_lead="Start where you left off: ")
pdf.bullet("My Attendance Logs reloads by itself every 30 seconds, so the data you see is always current.", bold_lead="Live data: ")
pdf.bullet("use Both / Summary on both pages. Any day that does not show MATCHED is worth reviewing.", bold_lead="Quick health check: ")
pdf.bullet("set each page separately - the selection is remembered only while you stay on that page.", bold_lead="Compare months: ")

pdf.h2("Frequently asked questions")
pdf.h3("Why do some rows show MISSING for a time out?")
pdf.para(
    "That session has no Time Out record in that source. In the Both / Summary "
    "view the day is flagged MISSING_TIMEOUT. If the hours matter for your pay, "
    "file a DTR Correction Form with HR."
)
pdf.h3("Why is a day BIOMETRIC_ONLY or ONLINE_ONLY?")
pdf.para(
    "That day has records in only one of the two systems - for example, you timed "
    "in online but did not pass by the biometric device (or the other way around). "
    "The status simply reflects what each system holds."
)
pdf.h3("What if Biometrics shows no data at all?")
pdf.para(
    "Your account may not yet be linked to a biometric device user, or biometric "
    "data access is still being set up for your account. Please contact the IT "
    "Office - your Online DTR records are not affected."
)
pdf.h3("Can I edit biometric records from this page?")
pdf.para(
    "No. Biometric attendance is read-only in this system. Corrections are "
    "processed by HR through the DTR Correction Form."
)

pdf.ln(2)
pdf.note(
    "Need more help? Contact the IT Office for technical concerns, or HR for "
    "attendance corrections. This manual covers the Log Source selector feature of "
    "the SPC Online DTR user dashboard (My Attendance Logs and Monthly Attendance)."
)

pdf.output(OUT)
print("Written:", OUT)
