using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace DushnilaPet {
    internal static class Native {
        [StructLayout(LayoutKind.Sequential)] internal struct POINT { public int X, Y; public POINT(int x,int y) {X=x;Y=y;} }
        [DllImport("user32.dll")] internal static extern bool GetCursorPos(out POINT pos);
        [DllImport("user32.dll")] internal static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")] internal static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint key);
        [DllImport("user32.dll")] internal static extern bool UnregisterHotKey(IntPtr hWnd, int id);
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] internal static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] internal static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] internal static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
        [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp);
        [DllImport("user32.dll")] internal static extern bool ClientToScreen(IntPtr hwnd, ref POINT pt);
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll")] internal static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern IntPtr VirtualAllocEx(IntPtr h, IntPtr addr, IntPtr size, uint alloc, uint protection);
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool VirtualFreeEx(IntPtr h, IntPtr addr, IntPtr size, uint freeType);
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out IntPtr read);
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern bool WriteProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out IntPtr written);
    }

    // GDI+ paints directly into the premultiplied BGRA surface passed to the compositor.
    internal sealed class AlphaSurface : IDisposable {
        [StructLayout(LayoutKind.Sequential)]
        struct Header {
            public uint size; public int width,height; public ushort planes,bits;
            public uint compression,imageBytes; public int xppm,yppm; public uint used,important;
        }
        [StructLayout(LayoutKind.Sequential,Pack=1)]
        struct Blend { public byte operation, flags, opacity, alpha; }
        [DllImport("gdi32")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32")] static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32")] static extern IntPtr SelectObject(IntPtr dc,IntPtr item);
        [DllImport("gdi32")] static extern bool DeleteObject(IntPtr item);
        [DllImport("gdi32")] static extern IntPtr CreateDIBSection(IntPtr dc,ref Header header,uint usage,out IntPtr pixels,IntPtr section,uint offset);
        [DllImport("user32",SetLastError=true)] static extern bool UpdateLayeredWindow(IntPtr hwnd,IntPtr screen,ref Native.POINT destination,ref Native.POINT size,IntPtr dc,ref Native.POINT source,uint color,ref Blend blend,uint flags);
        internal const int Width=552, Height=288;
        IntPtr dc,dib,old;
        internal Bitmap Bitmap {get;private set;}
        internal AlphaSurface() {
            try {
                dc=CreateCompatibleDC(IntPtr.Zero);
                var header=new Header{size=40,width=Width,height=-Height,planes=1,bits=32};
                IntPtr pixels;
                dib=CreateDIBSection(dc,ref header,0,out pixels,IntPtr.Zero,0);
                if(dc==IntPtr.Zero || dib==IntPtr.Zero || pixels==IntPtr.Zero)throw new InvalidOperationException("Не удалось создать поверхность питомца.");
                old=SelectObject(dc,dib);
                if(old==IntPtr.Zero || old==new IntPtr(-1))throw new InvalidOperationException("Не удалось выбрать поверхность питомца.");
                Bitmap=new Bitmap(Width,Height,Width*4,PixelFormat.Format32bppPArgb,pixels);
            } catch {Dispose();throw;}
        }
        internal void Present(IntPtr hwnd,Point at) {
            var dest=new Native.POINT(at.X,at.Y);var size=new Native.POINT(Width,Height);var origin=new Native.POINT();
            var blend=new Blend{opacity=255,alpha=1};
            if(!UpdateLayeredWindow(hwnd,IntPtr.Zero,ref dest,ref size,dc,ref origin,0,ref blend,2))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        public void Dispose() {
            if(Bitmap!=null){Bitmap.Dispose();Bitmap=null;}
            if(old!=IntPtr.Zero && old!=new IntPtr(-1))SelectObject(dc,old);
            if(dib!=IntPtr.Zero)DeleteObject(dib);
            if(dc!=IntPtr.Zero)DeleteDC(dc);
            old=dib=dc=IntPtr.Zero;
        }
    }

    internal sealed class Config {
        internal bool AutoKnock=true, Sound=true, Rage=true, Glasses=true, MonitorJump=true, GoogleChat=true, Ssh=true, IconMovement=false, Stories=true;
        internal int KnockMinutes=15, RageClicks=16, HoldSeconds=6, RageSeconds=30;
        internal readonly string PathName;
        internal Config() {
            string dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DushnilaPet");
            Directory.CreateDirectory(dir); PathName=Path.Combine(dir,"settings.ini");
            try {
                foreach(string line in File.ReadAllLines(PathName, Encoding.UTF8)) {
                    int sep=line.IndexOf('='); if(sep<1) continue;
                    string key=line.Substring(0,sep).Trim(), val=line.Substring(sep+1).Trim();
                    bool b=val=="1" || val.Equals("true",StringComparison.OrdinalIgnoreCase);
                    int n=0; int.TryParse(val,out n);
                    switch(key) {
                      case "AutoKnock":AutoKnock=b;break; case "Sound":Sound=b;break;
                      case "Rage":Rage=b;break;case "Glasses":Glasses=b;break;
                      case "MonitorJump":MonitorJump=b;break;case "GoogleChat":GoogleChat=b;break;
                      case "Ssh":Ssh=b;break;case "IconMovement":IconMovement=b;break;
                      case "Stories":Stories=b;break;case "KnockMinutes":KnockMinutes=Math.Max(1,Math.Min(120,n));break;
                      case "RageClicks":RageClicks=Math.Max(11,Math.Min(99,n));break;
                      case "HoldSeconds":HoldSeconds=Math.Max(1,Math.Min(60,n));break;
                      case "RageSeconds":RageSeconds=Math.Max(2,Math.Min(120,n));break;
                    }
                }
            } catch(IOException) {} catch(UnauthorizedAccessException) {}
        }
        internal void Save() {
            var lines=new string[] {
              "AutoKnock="+(AutoKnock?"1":"0"),"Sound="+(Sound?"1":"0"),
              "Rage="+(Rage?"1":"0"),"Glasses="+(Glasses?"1":"0"),
              "MonitorJump="+(MonitorJump?"1":"0"),"GoogleChat="+(GoogleChat?"1":"0"),
              "Ssh="+(Ssh?"1":"0"),"IconMovement="+(IconMovement?"1":"0"),
              "Stories="+(Stories?"1":"0"),"KnockMinutes="+KnockMinutes,
              "RageClicks="+RageClicks,"HoldSeconds="+HoldSeconds,"RageSeconds="+RageSeconds
            }; File.WriteAllLines(PathName,lines,Encoding.UTF8);
        }
    }

    internal class SettingsDialog : Form {
        private readonly Config c;
        private readonly Dictionary<string,CheckBox> checks=new Dictionary<string,CheckBox>();
        private readonly Dictionary<string,NumericUpDown> nums=new Dictionary<string,NumericUpDown>();
        internal SettingsDialog(Config config) {
            c=config; Text="Душнила Pet v13 — настройки"; Width=460; Height=610;
            StartPosition=FormStartPosition.CenterScreen; FormBorderStyle=FormBorderStyle.FixedDialog;
            MaximizeBox=false; MinimizeBox=false; TopMost=true; Font=new Font("Segoe UI",10f);
            int y=12;
            Check("Knock","Стучать по экрану каждые N минут",c.AutoKnock,ref y);
            Check("Sound","Звук только при стуке",c.Sound,ref y);
            Check("Rage","Берсерк и погоня за курсором",c.Rage,ref y);
            Check("Glasses","Сцена потери очков на 10-м клике",c.Glasses,ref y);
            Check("MonitorJump","Прыжки между мониторами",c.MonitorJump,ref y);
            Check("GoogleChat","Реакция на заголовок Google Chat",c.GoogleChat,ref y);
            Check("Ssh","Каска при запуске ssh.exe",c.Ssh,ref y);
            Check("IconMovement","Менять местами реальные ярлыки Windows (осторожно)",c.IconMovement,ref y);
            Check("Stories","Случайные сценки",c.Stories,ref y);
            Number("KnockMinutes","Интервал стука, минут",c.KnockMinutes,1,120,ref y);
            Number("RageClicks","Порог берсерка (больше 10)",c.RageClicks,11,99,ref y);
            Number("HoldSeconds","Удержание курсора, секунд",c.HoldSeconds,1,60,ref y);
            Number("RageSeconds","Весь берсерк, секунд",c.RageSeconds,2,120,ref y);
            var save=new Button{Text="Сохранить",Width=125,Height=35,Left=295,Top=y+12};
            save.Click+=(o,e)=>{ SaveFields(); DialogResult=DialogResult.OK; Close();}; Controls.Add(save);
            var cancel=new Button{Text="Отмена",Width=125,Height=35,Left=160,Top=y+12};
            cancel.Click+=(o,e)=>{DialogResult=DialogResult.Cancel;Close();}; Controls.Add(cancel);
            AcceptButton=save; CancelButton=cancel; ClientSize=new Size(435,y+61);
        }
        void Check(string name,string text,bool initial,ref int y) {
            var cb=new CheckBox{Text=text,Checked=initial,Left=14,Top=y,Width=410,Height=28};
            Controls.Add(cb);checks[name]=cb;y+=31;
        }
        void Number(string name,string text,int initial,int min,int max,ref int y) {
            var label=new Label{Text=text,Left=14,Top=y+6,Width=307,Height=25};
            var num=new NumericUpDown{Left=325,Top=y,Width=95,Minimum=min,Maximum=max,Value=Math.Min(max,Math.Max(min,initial))};
            Controls.Add(label);Controls.Add(num);nums[name]=num;y+=35;
        }
        void SaveFields() {
            c.AutoKnock=checks["Knock"].Checked;c.Sound=checks["Sound"].Checked;
            c.Rage=checks["Rage"].Checked;c.Glasses=checks["Glasses"].Checked;
            c.MonitorJump=checks["MonitorJump"].Checked;c.GoogleChat=checks["GoogleChat"].Checked;
            c.Ssh=checks["Ssh"].Checked;c.IconMovement=checks["IconMovement"].Checked;
            c.Stories=checks["Stories"].Checked;c.KnockMinutes=(int)nums["KnockMinutes"].Value;
            c.RageClicks=(int)nums["RageClicks"].Value;c.HoldSeconds=(int)nums["HoldSeconds"].Value;
            c.RageSeconds=(int)nums["RageSeconds"].Value;c.Save();
        }
    }

    // The Explorer desktop exposes a SysListView32 for icon positions on common Windows 10/11 shells.
    // Explorer builds without this view are left unchanged. Never delete any icons/files.
    internal static class DesktopIcons {
        const uint LVM_FIRST=0x1000,LVM_GETITEMCOUNT=LVM_FIRST+4,LVM_GETITEMPOSITION=LVM_FIRST+16;
        const uint LVM_SETITEMPOSITION=LVM_FIRST+15;
        private static IntPtr FindView() {
            IntPtr pg=Native.FindWindow("Progman",null);
            IntPtr view=Native.FindWindowEx(pg,IntPtr.Zero,"SHELLDLL_DefView",null);
            if(view==IntPtr.Zero) {
                IntPtr next=IntPtr.Zero;
                while((next=Native.FindWindowEx(IntPtr.Zero,next,"WorkerW",null))!=IntPtr.Zero) {
                    view=Native.FindWindowEx(next,IntPtr.Zero,"SHELLDLL_DefView",null);
                    if(view!=IntPtr.Zero) break;
                }
            }
            return view==IntPtr.Zero ? IntPtr.Zero : Native.FindWindowEx(view,IntPtr.Zero,"SysListView32","FolderView");
        }
        private static Native.POINT ReadPoint(IntPtr view,int index,IntPtr process,IntPtr remote) {
            IntPtr ok=Native.SendMessage(view,LVM_GETITEMPOSITION,(IntPtr)index,remote);
            if(ok==IntPtr.Zero) throw new Exception("Explorer не возвращает координаты ярлыков");
            byte[] b=new byte[8]; IntPtr read;
            if(!Native.ReadProcessMemory(process,remote,b,8,out read) || read.ToInt64()!=8) throw new Exception("Explorer не даёт прочитать координаты");
            return new Native.POINT(BitConverter.ToInt32(b,0),BitConverter.ToInt32(b,4));
        }
        private static void SetPosition(IntPtr view,int index,Native.POINT point) {
            // ListView uses a signed 16-bit X/Y packed in lParam; desktop coordinates are relative to the view.
            int packed=(point.X & 0xffff) | ((point.Y & 0xffff)<<16);
            Native.SendMessage(view,LVM_SETITEMPOSITION,(IntPtr)index,(IntPtr)packed);
        }
        internal static bool TrySwap(Random rng,out Point p) {
            p=Point.Empty;
            IntPtr view=FindView(); if(view==IntPtr.Zero || !Native.IsWindowVisible(view)) return false;
            int n=Native.SendMessage(view,LVM_GETITEMCOUNT,IntPtr.Zero,IntPtr.Zero).ToInt32();
            if(n<2 || n>4096) return false;
            uint pid; Native.GetWindowThreadProcessId(view,out pid);
            IntPtr proc=Native.OpenProcess(0x0008|0x0010|0x0020|0x0400,false,pid);
            if(proc==IntPtr.Zero) return false;
            IntPtr remote=IntPtr.Zero;
            try {
                remote=Native.VirtualAllocEx(proc,IntPtr.Zero,(IntPtr)32,0x3000,0x04);
                if(remote==IntPtr.Zero) return false;
                int a=rng.Next(n), b=rng.Next(n-1);if(b>=a)b++;
                Native.POINT aa=ReadPoint(view,a,proc,remote), bb=ReadPoint(view,b,proc,remote);
                if(aa.X<0 || aa.Y<0 || bb.X<0 || bb.Y<0) return false;
                Native.POINT screen=aa; Native.ClientToScreen(view,ref screen);
                p=new Point(screen.X,screen.Y);
                SetPosition(view,a,bb); SetPosition(view,b,aa);
                return true;
            } catch {return false;}
            finally {if(remote!=IntPtr.Zero) Native.VirtualFreeEx(proc,remote,IntPtr.Zero,0x8000);Native.CloseHandle(proc);}
        }
    }

    internal sealed class PetInput : Form {
        readonly Dictionary<string,Region> shapes=new Dictionary<string,Region>();
        string current;
        internal PetInput() {
            AutoScaleMode=AutoScaleMode.None; FormBorderStyle=FormBorderStyle.None;
            StartPosition=FormStartPosition.Manual; ShowInTaskbar=false; TopMost=true;
            ClientSize=new Size(164,164); BackColor=Color.Black; Opacity=1.0/255;
        }
        protected override bool ShowWithoutActivation {get{return true;}}
        protected override CreateParams CreateParams {
            get {var cp=base.CreateParams; cp.ExStyle |= 0x08000080; return cp;}
        }
        internal void LoadShapes(Stream stream) {
            using(var reader=new BinaryReader(stream)) {
                int count=reader.ReadUInt16();
                for(int i=0;i<count;i++) {
                    string name=Encoding.ASCII.GetString(reader.ReadBytes(reader.ReadByte()));
                    int n=reader.ReadUInt16();
                    using(var normal=new GraphicsPath(FillMode.Winding))
                    using(var mirrored=new GraphicsPath(FillMode.Winding)) {
                        for(int j=0;j<n;j++) {
                            int x=reader.ReadByte(),y=reader.ReadByte(),w=reader.ReadByte();
                            normal.AddRectangle(new Rectangle(x,y,w,1));
                            mirrored.AddRectangle(new Rectangle(164-x-w,y,w,1));
                        }
                        shapes[name]=new Region(normal); shapes[name+"!"]=new Region(mirrored);
                    }
                }
            }
        }
        internal void AlignSprite(Point screen,string name,bool flip) {
            string key=name+(flip?"!":"");
            if(current!=key) {
                Region shape;
                if(!shapes.TryGetValue(key,out shape))shape=shapes["0"];
                Region previous=Region;Region=shape.Clone();if(previous!=null)previous.Dispose();
                current=key;
            }
            if(Location!=screen) Location=screen;
        }
        protected override void Dispose(bool disposing) {
            if(disposing){foreach(var shape in shapes.Values)shape.Dispose();shapes.Clear();}
            base.Dispose(disposing);
        }
    }

    internal sealed class PetForm : Form {
        private const int W=164,HOT_EXIT=1501,HOT_RELEASE=1502;
        private readonly System.Media.SoundPlayer knockSound = new System.Media.SoundPlayer();
        private readonly Config conf=new Config();
        private readonly PetInput input=new PetInput();
        private readonly AlphaSurface surface=new AlphaSurface();
        private readonly Dictionary<string,Image> frames=new Dictionary<string,Image>();
        private readonly Random random=new Random();
        private readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
        private readonly NotifyIcon tray;
        private DateTime tickAt=DateTime.UtcNow, knockAt, bubbleUntil, rageUntil, holdUntil, nextSshScan, nextChatScan, storyAt;
        private HashSet<int> previousSsh=new HashSet<int>();
        private string state="idle", phrase="", story="";
        private double age=0, energy=100, distance=0, originX, reach, walkAge, flightFromX,flightFromY,flightToX,flightToY;
        private int dir=-1, blindDir=-1, clicks=0, walks=0, storyCycle=0, wakeups=0, storyPhase=-1;
        private float x,y;
        private bool dragging=false,pressed=false,chatSeen=false,hasGlasses=false,hasExit=false;
        private Point mouseDown,dragOffset;
        private double dragAge;
        private DateTime speechAt;
        private readonly string[] originals={"тебя в гугле забанили?","кому интересно твоё мнение?","руки мыл?","потом днище порвет!","у меня всё работает!"};
        private readonly string[] clickLines={"Тикет завёл или просто тычешь?","У тебя на мышке только одна кнопка?","Ты так и в прод деплоишь?","Твой YAML опять пробел потерял.","На шестой клик нужен аппрув.","В тикете так и напиши: само нажалось.","Логи читали. Они тоже против.","Сначала кофе. Потом твой инцидент.","Ты меня в избранное добавь?"};
        private readonly string[] rageLines={"Всё. Теперь моя очередь кликать.","Мышку на стол. Медленно.","Теперь ты проходишь капчу."};
        private int sayOriginal=0;
        private Image glasses;
        private string storyProp="";
        private readonly string memoryPath;
        protected override CreateParams CreateParams {
            get {CreateParams cp=base.CreateParams; cp.ExStyle |= 0x00000020 /* mouse goes to the owned silhouette window */ | 0x00080000 /* WS_EX_LAYERED */ | 0x00000080 /* WS_EX_TOOLWINDOW */ | 0x08000000 /* WS_EX_NOACTIVATE */;return cp;}
        }
        internal PetForm(string baseDir) {

            Text="Душнила Pet v13";
            ShowInTaskbar=false;TopMost=true;FormBorderStyle=FormBorderStyle.None;
            StartPosition=FormStartPosition.Manual;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint,true);
            Size=new Size(AlphaSurface.Width, AlphaSurface.Height);
            using (var archive = new System.IO.Compression.ZipArchive(typeof(PetForm).Assembly.GetManifestResourceStream("PetAssets"))) {
                foreach (var item in archive.Entries) {
                    if(item.FullName=="hitmasks.bin"){using(var stream=item.Open()) input.LoadShapes(stream);}
                    else if (item.FullName.StartsWith("frames/") && item.Name.EndsWith(".png")) {
                        using (var stream=item.Open())
                        using (var bitmap=Image.FromStream(stream)) frames[Path.GetFileNameWithoutExtension(item.Name)] = new Bitmap(bitmap);
                    } else if (item.Name=="window_knock02.wav") {
                        var data = new MemoryStream();
                        using (var audioStream=item.Open()) audioStream.CopyTo(data);
                        data.Position=0; knockSound.Stream=data; knockSound.Load();
                    }
                }
            }
            if(!frames.TryGetValue("0",out glasses)) throw new FileNotFoundException("Отсутствуют кадры персонажа");
            frames.TryGetValue("glasses",out glasses);
            Rectangle s=Screen.PrimaryScreen.Bounds;
            x=s.Left+s.Width*.72f;y=s.Bottom-145;
            memoryPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"DushnilaPet","wakeups.txt");
            try {int.TryParse(File.ReadAllText(memoryPath),out wakeups);} catch{}
            knockAt=DateTime.UtcNow.AddMinutes(conf.KnockMinutes);
            nextSshScan=DateTime.UtcNow;nextChatScan=DateTime.UtcNow;
            storyAt=DateTime.UtcNow.AddSeconds(80);
            tray=new NotifyIcon();tray.Icon=SystemIcons.Application;tray.Text="Душнила Pet v13";
            var menu=new ContextMenuStrip();
            menu.Items.Add("Принудительно: стук",null,(o,e)=>Knock());
            menu.Items.Add("Сценка: очки + падение",null,(o,e)=>{clicks=10;StartBlind();});
            menu.Items.Add("Сценка: синяя каска",null,(o,e)=>EnterState("helmet"));
            menu.Items.Add("Сценка: Google Chat",null,(o,e)=>EnterState("pockets","вот дебилы"));
            menu.Items.Add("Начать берсерк",null,(o,e)=>StartRage());
            menu.Items.Add("Поменять два ярлыка",null,(o,e)=>TrySwapIcons(true));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Настройки",null,(o,e)=>ShowSettings());
            menu.Items.Add("Успокоить / отпустить курсор",null,(o,e)=>Release());
            menu.Items.Add("Завершить Душнилу",null,(o,e)=>Close());
            tray.ContextMenuStrip=menu;tray.Visible=true;
            tray.DoubleClick+=(o,e)=>ShowSettings();
            timer.Interval=33;timer.Tick+=(o,e)=>OnTick(); timer.Start();
            Say("руки мыл?");
            try {previousSsh=new HashSet<int>(Process.GetProcessesByName("ssh").Select(q=>q.Id));} catch{}
            input.MouseDown+=OnPetDown;input.MouseMove+=OnPetMove;input.MouseUp+=OnPetUp;
        }
        protected override void OnShown(EventArgs e) {
            base.OnShown(e);
            RenderPet();
            input.Show(this);
            hasExit=Native.RegisterHotKey(Handle,HOT_EXIT,0x0001|0x0002|0x0004,0x51); // Ctrl+Alt+Shift+Q
            Native.RegisterHotKey(Handle,HOT_RELEASE,0x0001|0x0002|0x0004,0x52); // Ctrl+Alt+Shift+R
        }
        protected override void WndProc(ref Message m) {
            if(m.Msg==0x0312) {
                if(m.WParam.ToInt32()==HOT_EXIT) { Close();return; }
                if(m.WParam.ToInt32()==HOT_RELEASE) { Release();return; }
            }
            base.WndProc(ref m);
        }
        private void EnterState(string next,string line=null) {
            state=next;age=0;dragAge=0;
            if(next=="blind") { hasGlasses=true;blindDir=dir;originX=x;reach=Math.Min(112,dir>0?Monitor(x,y).Right-x:x-Monitor(x,y).Left);}
            if(next!="blind" && next!="pickup" && next!="wipe" && next!="puton")hasGlasses=false;
            if(line!=null)Say(line);
        }
        private void Say(string line) {phrase=line;bubbleUntil=DateTime.UtcNow.AddMilliseconds(2400);speechAt=DateTime.UtcNow;}
        private void Release() {clicks=0;state="idle";age=0;holdUntil=DateTime.MinValue;rageUntil=DateTime.MinValue;Say("Ладно. Живи пока.");}
        private void StartBlind() {EnterState("blind","МАКС!!!!");}
        private void StartRage() {if(!conf.Rage)return;EnterState("rage",rageLines[random.Next(rageLines.Length)]);rageUntil=DateTime.UtcNow.AddSeconds(conf.RageSeconds);}
        private void EndRage() {clicks=0;EnterState("sleep");holdUntil=DateTime.MinValue;}
        private bool IsHot {get{return state=="rage"||state=="chase"||state=="hold";}}
        private bool CanKnock {get{return state=="idle"||state=="walk"||state=="smoke"||state=="hello"||state=="annoyed"||state=="sleep"||state=="tired";}}
        private void Knock() {
            if(IsHot||dragging)return;
            EnterState("knock","курить пойдешь ?");
            if(conf.Sound)try {
               
               knockSound.Play();
            } catch(Exception err) {Say("Не удалось воспроизвести стук: "+err.Message);}
        }
        private Rectangle Monitor(float px,float py) {
            foreach(Screen s in Screen.AllScreens) if(s.Bounds.Contains((int)px,(int)py))return s.Bounds;
            return Screen.PrimaryScreen.Bounds;
        }
        private void ScanSsh() {
            if(!conf.Ssh)return;
            try {
                var ids=new HashSet<int>(Process.GetProcessesByName("ssh").Select(p=>p.Id));
                if(ids.Except(previousSsh).Any() && CanKnock) EnterState("helmet");
                previousSsh=ids;
            } catch{}
        }
        private void ScanChat() {
            if(!conf.GoogleChat){chatSeen=false;return;}
            IntPtr hwnd=Native.GetForegroundWindow();if(hwnd==IntPtr.Zero)return;
            var sb=new StringBuilder(512);Native.GetWindowText(hwnd,sb,sb.Capacity);
            string title=sb.ToString();
            bool chat=title.IndexOf("Google Chat",StringComparison.OrdinalIgnoreCase)>=0 ||
               title.IndexOf("Чат Google",StringComparison.OrdinalIgnoreCase)>=0 ||
               title.IndexOf("chat.google.com",StringComparison.OrdinalIgnoreCase)>=0;
            if(!chat)chatSeen=false;
            else if(!chatSeen && CanKnock) {chatSeen=true;EnterState("pockets","вот дебилы");}
        }
        private void BeginJump() {
            Rectangle here=Monitor(x,y);
            Screen[] other=Screen.AllScreens.Where(s=>s.Bounds!=here).ToArray();
            if(other.Length==0)return;
            Rectangle dest=other[random.Next(other.Length)].Bounds;
            bool right=dest.Left>=here.Right, left=dest.Right<=here.Left;
            bool down=dest.Top>=here.Bottom;
            flightFromX=right?here.Right-92:left?here.Left+92:x;
            flightFromY=right||left?y:(down?here.Bottom-100:here.Top+100);
            flightToX=right?dest.Left+92:left?dest.Right-92:Math.Max(dest.Left+100,Math.Min(dest.Right-100,x));
            flightToY=right||left?Math.Max(dest.Top+120,Math.Min(dest.Bottom-115,y)): (down?dest.Top+120:dest.Bottom-115);
            dir=flightToX>x?1:-1;
            EnterState("runup","Держи монитор, я прыгаю!");
        }
        private void StartStory() {
            if(!conf.Stories)return;
            story=new[]{"protest","faint","ufo"}[storyCycle++%3];storyPhase=-1;
            EnterState("story");storyAt=DateTime.UtcNow.AddSeconds(90+random.Next(90));
        }
        private void ClickPet() {
            if(state=="sleep") {energy=Math.Max(52,energy);clicks=0;EnterState("hello","Это был плановый простой.");
                wakeups++;try {File.WriteAllText(memoryPath,wakeups.ToString());} catch{}
                if(wakeups>1) Say("Опять будишь? Уже "+wakeups+"-й раз!");return;}
            if(state=="story"&&story=="faint") {EnterState("hello","Чего надо?");return;}
            if(IsHot || state=="helmet" || state=="knock")return;
            clicks++;
            if(conf.Rage&&clicks>=conf.RageClicks) {StartRage();return;}
            if(conf.Glasses&&clicks==10) {StartBlind();return;}
            if(state=="blind"||state=="pickup"||state=="wipe"||state=="puton")return;
            string line=(++sayOriginal%2==0) ? originals[random.Next(originals.Length)] : clickLines[random.Next(clickLines.Length)];
            EnterState(clicks>=7?"annoyed":"hello",line);
        }
        private void TrySwapIcons(bool forced) {
            if(!conf.IconMovement) {Say("Сначала разреши перемещение ярлыков в настройках.");return;}
            Point pt;
            bool changed=DesktopIcons.TrySwap(random,out pt);
            if(!changed) {if(forced)Say("Explorer не дал переместить ярлыки.");return;}
            dir=pt.X>x?1:-1;
            if(Monitor(pt.X,pt.Y).Contains(pt)) {x=pt.X;y=pt.Y+60;}
            EnterState("shove");
        }
        private void OnTick() {
            try {
                DateTime now=DateTime.UtcNow;
                double dt=Math.Min(.1,(now-tickAt).TotalSeconds);tickAt=now;age+=dt;
                if(IsHot && rageUntil!=DateTime.MinValue && now>=rageUntil)EndRage();
                if(state=="hold"&&holdUntil!=DateTime.MinValue&&now>=holdUntil)EndRage();
                if(now>=nextSshScan){nextSshScan=now.AddSeconds(1.4);ScanSsh();}
                if(now>=nextChatScan){nextChatScan=now.AddSeconds(.75);ScanChat();}
                if(conf.AutoKnock && now>=knockAt && CanKnock&&!dragging) {
                    do{knockAt=knockAt.AddMinutes(conf.KnockMinutes);}while(knockAt<=now);
                    Knock();
                }
                if(!dragging) Step(dt);
                if(state=="idle"&&now>=storyAt)StartStory();
                if(!Screen.AllScreens.Any(s=>s.Bounds.Contains((int)x,(int)y))&&! (state=="flight"||state=="runup")) {
                    Rectangle m=Screen.PrimaryScreen.Bounds;x=m.Left+m.Width*.7f;y=m.Bottom-145;
                }
                RenderPet();
            } catch(Exception ex){try{File.AppendAllText(Path.Combine(Path.GetDirectoryName(conf.PathName),"error.log"),DateTime.Now+" "+ex+Environment.NewLine);}catch{}}
        }
        private void Step(double dt) {
            Rectangle m=Monitor(x,y);
            switch(state) {
                case "idle":
                    if(age>=4){walks++;
                        if(conf.MonitorJump&&Screen.AllScreens.Length>1&&walks%6==3)BeginJump();
                        else if(conf.IconMovement&&walks%4==0)TrySwapIcons(false);
                        else if(walks%2==0)EnterState("smoke","Пайплайн идёт. Успею на перекур.");
                        else EnterState("walk");
                    }break;
                case "hello":case "annoyed":if(age>=2.5)EnterState("idle");break;
                case "walk":{
                    double speed=72*Math.Min(1,Math.Min(age*4,Math.Max(.2,(3-age)*4)))*dt;
                    x+=(float)(dir*speed);distance+=speed;
                    if(x<m.Left+48){x=m.Left+48;dir=1;}
                    if(x>m.Right-48){x=m.Right-48;dir=-1;}
                    energy-=dt;
                    if(energy<=0)EnterState("tired","Всё, у меня обед по SLA.");
                    else if(age>=3)EnterState("idle");break;
                }
                case "blind": {
                    double t=age,off=0;
                    if(t>=2.1&&t<4.3 || t>=9.6)dir=-blindDir;
                    else if(t>=4.3&&t<7.8)dir=-blindDir;
                    else dir=blindDir;
                    if(t<2.1)off=Mix(.7,2.1,0,1,t);
                    else if(t<4.3)off=t<3.9?Mix(2.1,3.9,1,.32,t):Mix(3.9,4.3,.32,.08,t);
                    else if(t<8.4)off=.08;
                    else if(t<9.6)off=Mix(8.4,9.6,.08,.82,t);
                    else off=Mix(9.6,10.8,.82,0,t);
                    double nx=Math.Max(m.Left+48,Math.Min(m.Right-48,originX+off*reach*blindDir));
                    distance+=Math.Abs(nx-x);x=(float)nx;
                    if(t>=10.8){dir=blindDir;EnterState("pickup");}break;
                }
                case "pickup":if(age>=.85)EnterState("wipe");break;
                case "wipe":if(age>=1.8)EnterState("puton","Анттиценности какие-то");break;
                case "puton":if(age>=2.5)EnterState("idle");break;
                case "pockets":if(age>=3.3)EnterState("idle");break;
                case "knock":if(age>=2.5)EnterState("idle");break;
                case "helmet":if(age>=2.4&&age-dt<2.4)Say("Вперёд в прод!");if(age>=6)EnterState("idle");break;
                case "runup":{
                    double dx=flightFromX-x,dy=flightFromY-y,dist=Math.Sqrt(dx*dx+dy*dy);
                    double step=Math.Min(dist,dt*(150+Math.Min(1,age)*300));
                    if(dist>1){x+=(float)(dx*step/dist);y+=(float)(dy*step/dist);}
                    if(dist<=step+1)EnterState("flight");break;
                }
                case "flight": {
                    double t=Math.Min(1,age/.95),arc=4*t*(1-t);
                    x=(float)(flightFromX+(flightToX-flightFromX)*t);
                    y=(float)(flightFromY+(flightToY-flightFromY)*t-70*arc);
                    if(t>=1)EnterState("landing");break;
                }
                case "landing":if(age>=.38)EnterState("idle");break;
                case "smoke":if(age>=6.5)EnterState("idle");break;
                case "shove":if(age>=1.6)EnterState("proud","так-то получше будет");break;
                case "proud":if(age>=3)EnterState("idle");break;
                case "rage":if(age>=.85)EnterState("chase");break;
                case "chase":{
                    Native.POINT target; if(!Native.GetCursorPos(out target))break;
                    double dx=target.X-x,dy=target.Y-y,d=Math.Sqrt(dx*dx+dy*dy),step=Math.Min(d,dt*490);
                    if(Math.Abs(dx)>4)dir=dx>0?1:-1;
                    if(d>0){x+=(float)(dx*step/d);y+=(float)(dy*step/d);}
                    energy-=step*.033+dt;
                    if(energy<=0)EnterState("tired","На этот цирк лимиты кончились.");
                    else if(d-step<=12) {holdUntil=DateTime.UtcNow.AddSeconds(conf.HoldSeconds);EnterState("hold","Мышь изъята до ревью.");}
                    break;
                }
                case "hold":Native.SetCursorPos((int)x,(int)y);break;
                case "tired":if(age>2.1){clicks=0;EnterState("sleep");}break;
                case "sleep":energy=Math.Min(100,energy+dt*4);if(energy>=100&&age>=24){clicks=0;EnterState("idle");}break;
                case "story":if(age>11)EnterState("idle");break;
            }
        }
        private static double Mix(double a,double b,double from,double to,double t) {
            double v=(t-a)/(b-a);if(v<0)v=0;if(v>1)v=1;return from+(to-from)*v;
        }
        private string Frame() {
            switch(state) {
                case "walk":case "runup":return "w"+(((int)(distance/10))%8);
                case "chase":return "h"+(4+((int)(age*9)%2));
                case "rage":return "h"+(7+((int)(age*9)%2));
                case "hold":return ((int)(age*4)%2==0)?"h7":"h3";
                case "hello":return ((int)(age*1.8)%2==0)?"2":"3";
                case "annoyed":return ((int)(age*1.8)%2==0)?"3":"7";
                case "tired":return ((int)(age*1.8)%2==0)?"8":"9";
                case "sleep":return ((int)(age*1.8)%2==0)?"10":"11";
                case "blind":
                    if(age<.7||(age>=7.2&&age<8.4))return "look";
                    if(age>=3.9&&age<4.3)return "stumble";
                    if(age>=4.3&&age<6.5)return "fallen"+((int)((age-4.3)*10)%16);
                    if(age>=6.5&&age<7.2)return "rising"+((int)((age-6.5)*20)%14);
                    return "search"+((int)(distance/10)%8);
                case "pickup":return "pickup";
                case "wipe":return "wipe"+((int)(age*5)%2);
                case "puton":return age<1.15?"puton":"0";
                case "helmet":{int phase=0;foreach(double t in new[]{.25,.7,1.15,1.75,2.4})if(age>=t)phase++;return "hardhat"+phase;}
                case "pockets":return age<.4||age>3?"pockets0":"pockets1";
                case "knock": {double[] hits={.05,.23,.41,.60,.78,.97,1.14};foreach(double t in hits)if(age>=t-.022&&age<t+.068)return "tap";return age<1.85?"fist":"3";}
                case "smoke":return age%3<1.15?"inhale":"exhale";
                case "flight":return "air";
                case "landing":return "land";
                case "shove":return age<.5?"windup":((int)(age*5)%2==0?"shove0":"shove1");
                case "proud":return "proud";
                case "story":return StoryFrame();
                default:return ((int)(age*1.8)%3==0)?"1":"0";
            }
        }
        private string StoryFrame() {
            double[] durations;string[] photos,props,lines;
            if(story=="protest") {
                durations=new[]{1.3,3.4,2.6};photos=new[]{"windup","proud","point"};
                props=new[]{"📦","🪧","🪧"};lines=new[]{"У меня заявление.","ХВАТИТ РАБОТАТЬ","Даже на пикет один вышел."};
            } else if(story=="faint") {
                durations=new[]{1.4,6.0,2.5};photos=new[]{"land","10","laugh"};
                props=new[]{"","",""};lines=new[]{"Что-то душно стало…","","Да живой я. Проверял."};
            } else {
                durations=new[]{2.0,2.6,2.8};photos=new[]{"point","air","land"};
                props=new[]{"🛸","🛸","🛸"};lines=new[]{"А эти ещё из какого отдела?","Меня хотя бы из чата удалите!","Даже этим я не нужен!"};
            }
            double t=age;
            for(int k=0;k<durations.Length;k++) {
                if(t<durations[k]) {
                    if(storyPhase!=k) {storyPhase=k;storyProp=props[k];if(lines[k].Length>0)Say(lines[k]);else bubbleUntil=DateTime.MinValue;}
                    return photos[k];
                } t-=durations[k];
            }
            storyProp="";return "0";
        }
        protected override void OnPaintBackground(PaintEventArgs e) {}
        protected override void OnPaint(PaintEventArgs e) {}
        private void RenderPet() {
            if(!Visible || !IsHandleCreated || IsDisposed) return;
            Rectangle desktop=SystemInformation.VirtualScreen;
            int left=Math.Max(desktop.Left,Math.Min(desktop.Right-AlphaSurface.Width,(int)x-AlphaSurface.Width/2));
            int top=Math.Max(desktop.Top,Math.Min(desktop.Bottom-AlphaSurface.Height,(int)y-141));
            Rectangle view=new Rectangle(left,top,AlphaSurface.Width,AlphaSurface.Height);
            using(Graphics g=Graphics.FromImage(surface.Bitmap)) {
                g.Clear(Color.FromArgb(0,0,0,0));
                DrawPet(g,view);
            }
            surface.Present(Handle,view.Location);
        }
        private void DrawPet(Graphics g, Rectangle v) {
            g.SmoothingMode=SmoothingMode.AntiAlias;
            g.InterpolationMode=InterpolationMode.HighQualityBicubic;
            string key=dragging?"carry"+new[]{0,1,2,1}[(int)(dragAge*4)%4]:Frame();
            Image im; if(!frames.TryGetValue(key,out im))frames.TryGetValue("0",out im);
            if(im==null)return;
            float px=x-v.Left-W/2f,py=y-v.Top-W/2f;
            bool flip=dir>0&&(state=="walk"||state=="blind"||state=="chase"||state=="runup"||state=="flight"||state=="pockets"||state=="story");
            input.AlignSprite(new Point((int)Math.Round(x-W/2f),(int)Math.Round(y-W/2f)),key,flip);
            if(flip) {GraphicsState save=g.Save();g.TranslateTransform(px+W,py);g.ScaleTransform(-1,1);g.DrawImage(im,0,0,W,W);g.Restore(save);}
            else g.DrawImage(im,px,py,W,W);
            if(state=="blind"&&glasses!=null) {
                double t=Math.Min(1,age/.55),glx=originX-12+blindDir*Math.Min(32,reach*.32)*t;
                double gly=y-57+120*t*t;
                g.DrawImage(glasses,(float)(glx-v.Left),(float)(gly-v.Top),26,12);
            }
            if(state=="story"&&storyProp.Length>0) {
                using(var f=new Font("Segoe UI Emoji",24)) using(var b=new SolidBrush(Color.Black))
                    g.DrawString(storyProp,f,b,px+105,py-36);
            }
            if(state=="sleep") {phrase="z Z z";bubbleUntil=DateTime.UtcNow.AddSeconds(.3);}
            if(DateTime.UtcNow<bubbleUntil&&phrase.Length>0) {
                using(var font=new Font("Segoe UI",10f,FontStyle.Bold)) {
                    SizeF measure=g.MeasureString(phrase,font);
                    float bw=Math.Min(520,measure.Width+24),bh=Math.Max(32,measure.Height+12);
                    float bx=Math.Max(6,Math.Min(v.Width-bw-6,(x-v.Left)-bw/2));
                    float by=(y-v.Top)<125?(y-v.Top)+79:(y-v.Top)-112;
                    using(var bg=new SolidBrush(Color.FromArgb(255,246,222)))
                    using(var outline=new Pen(Color.FromArgb(44,42,37),2f))
                    using(var ink=new SolidBrush(Color.FromArgb(36,36,34))) {
                        g.FillRoundedRectangle(bg,bx,by,bw,bh,10);g.DrawRoundedRectangle(outline,bx,by,bw,bh,10);
                        g.DrawString(phrase,font,ink,bx+11,by+6);
                    }
                }
            }
        }
        private void OnPetDown(object sender,MouseEventArgs e) {
            if(e.Button==MouseButtons.Right) {if(IsHot)Release();tray.ContextMenuStrip.Show(Cursor.Position);return;}
            if(e.Button==MouseButtons.Middle) {Knock();return;}
            if(e.Button!=MouseButtons.Left)return;
            Keys modifiers=Control.ModifierKeys;
            if((modifiers & Keys.Control)==Keys.Control){StartStory();return;}
            if((modifiers & Keys.Shift)==Keys.Shift){TrySwapIcons(true);return;}
            if(IsHot)return;
            pressed=true;dragging=false;mouseDown=Cursor.Position;
            dragOffset=new Point((int)x-mouseDown.X,(int)y-mouseDown.Y);
            input.Capture=true;
        }
        private void OnPetMove(object sender,MouseEventArgs e) {
            if(!pressed)return;
            Point p=Cursor.Position;
            if(!dragging&&Math.Abs(p.X-mouseDown.X)+Math.Abs(p.Y-mouseDown.Y)>10){dragging=true;dragAge=0;bubbleUntil=DateTime.MinValue;}
            if(dragging) {x=p.X+dragOffset.X;y=p.Y+dragOffset.Y;dragAge+=.033;RenderPet();}
        }
        private void OnPetUp(object sender,MouseEventArgs e) {
            if(!pressed||e.Button!=MouseButtons.Left)return;
            input.Capture=false;pressed=false;
            if(dragging) {
                Rectangle m=Monitor(x,y);
                x=Math.Max(m.Left+48,Math.Min(m.Right-48,x));
                y=Math.Max(m.Top+80,Math.Min(m.Bottom-80,y));
                dragging=false;EnterState("idle");
            } else ClickPet();
        }
        private void ShowSettings() {
            using(var dlg=new SettingsDialog(conf)) {
                if(dlg.ShowDialog()==DialogResult.OK) {
                    knockAt=DateTime.UtcNow.AddMinutes(conf.KnockMinutes);
                    if(!conf.Rage&&IsHot)Release();
                }
            }
        }
        protected override void OnFormClosed(FormClosedEventArgs e) {
            timer.Stop();input.Dispose();surface.Dispose();tray.Visible=false;tray.Dispose();
            Native.UnregisterHotKey(Handle,HOT_EXIT);Native.UnregisterHotKey(Handle,HOT_RELEASE);
            foreach(Image img in frames.Values)img.Dispose();
            base.OnFormClosed(e);
        }
    }

    internal static class Drawing {
        // .NET Framework 4.8 lacks Graphics.FillRoundedRectangle extension methods.
        internal static GraphicsPath RoundRect(float x,float y,float w,float h,float r) {
            var path=new GraphicsPath();float d=r*2;
            path.AddArc(x,y,d,d,180,90);path.AddArc(x+w-d,y,d,d,270,90);
            path.AddArc(x+w-d,y+h-d,d,d,0,90);path.AddArc(x,y+h-d,d,d,90,90);
            path.CloseFigure();return path;
        }
    }
    internal static class DrawingExtensions {
        public static void FillRoundedRectangle(this Graphics g,Brush b,float x,float y,float w,float h,float r) {
            using(GraphicsPath p=Drawing.RoundRect(x,y,w,h,r))g.FillPath(b,p);
        }
        public static void DrawRoundedRectangle(this Graphics g,Pen b,float x,float y,float w,float h,float r) {
            using(GraphicsPath p=Drawing.RoundRect(x,y,w,h,r))g.DrawPath(b,p);
        }
    }
    public static class Entry {
        [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
        [STAThread]
        public static void Main() {
            try { SetProcessDPIAware(); Run(AppDomain.CurrentDomain.BaseDirectory); }
            catch (Exception e) { MessageBox.Show(e.ToString(), "Душнила v13"); }
        }
        public static void Run(string root) {
            bool unique=false;
            using(var mutex=new System.Threading.Mutex(true,"DushnilaPet_v13_"+Environment.UserName,out unique)) {
                if(!unique)return;
                Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.Run(new PetForm(root));
            }
        }
    }
}
