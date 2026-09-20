# Network Design & Subnetting Plan
### Deployment environment for **Oja** — Small Business & Institution Operations System
**Benjamin John Abakasanga · SIWES Capstone · Topfaith University**

---

## 1. Purpose and scope

Oja runs as a cloud application, but its *users* sit inside an organisation's premises. This document designs the local network those users work on: how the site is divided into departments, how addresses are allocated without waste, and how traffic is allowed out to the Supabase database.

**Design brief:** a single-site organisation (campus store / small business / school administration block) with six network segments and a total of about 118 devices, growing to roughly 180 within two years. The organisation has been allocated the private address block **192.168.10.0/24**.

---

## 2. Requirements gathering

| # | Department / segment | Devices today | Planned growth | Total needed |
|---|---|---:|---:|---:|
| 1 | Sales / Point of Sale | 38 | 12 | **50** |
| 2 | Guest Wi-Fi (visitors, students) | 20 | 8 | **28** |
| 3 | Administration & Finance | 14 | 6 | **20** |
| 4 | Inventory / Store room | 8 | 4 | **12** |
| 5 | Servers & local services (DNS, print, NVR) | 4 | 2 | **6** |
| 6 | Network management (switch/AP/firewall mgmt) | 2 | 0 | **2** |
| | **Total host requirement** | | | **118** |

---

## 3. Why VLSM and not fixed-length subnetting

**The fixed-length (FLSM) approach fails.** If every subnet must be the same size, that size is dictated by the largest requirement — 50 hosts — which needs a **/26** (62 usable hosts).

```
6 subnets × 64 addresses per /26 = 384 addresses
A /24 contains only                256 addresses          →  IT DOES NOT FIT
```

Even if it did fit, the Network-Management segment would be handed 62 usable addresses to hold 2 devices — 97% waste.

**VLSM (Variable Length Subnet Masking)** lets each subnet carry a mask sized to its own requirement. The rule is simple and must be followed exactly:

> **Allocate in descending order of host requirement, largest subnet first.**

Allocating largest-first guarantees each block starts on a valid boundary for its own size. Allocating smallest-first fragments the space and produces overlapping or illegal block boundaries.

---

## 4. The subnetting calculation, step by step

### 4.1 Choosing the mask
For a required number of hosts **H**, find the smallest **h** (number of host bits) where:

$$2^h - 2 \ge H$$

*(We subtract 2 because the all-zeros host address is the **network address** and the all-ones host address is the **broadcast address**; neither can be assigned to a device.)*

| Required | Host bits h | 2^h − 2 usable | Prefix (32 − h) | Mask | Block size |
|---:|---:|---:|---|---|---:|
| 50 | 6 | 62 | /26 | 255.255.255.192 | 64 |
| 28 | 5 | 30 | /27 | 255.255.255.224 | 32 |
| 20 | 5 | 30 | /27 | 255.255.255.224 | 32 |
| 12 | 4 | 14 | /28 | 255.255.255.240 | 16 |
| 6 | 3 | 6 | /29 | 255.255.255.248 | 8 |
| 2 | 2 | 2 | /30 | 255.255.255.252 | 4 |

### 4.2 The binary working (be ready to reproduce this on a whiteboard)

```
Base network      192.168.10.0/24
                  11000000.10101000.00001010.00000000
Default /24 mask  11111111.11111111.11111111.00000000

Borrowing 2 bits from the host portion gives /26:
/26 mask          11111111.11111111.11111111.11000000  = 255.255.255.192
                                              ^^
                                              2 borrowed bits → 2² = 4 subnets
                                              6 host bits     → 2⁶ − 2 = 62 hosts

Block size shortcut:  256 − 192 = 64
So the /26 boundaries in the last octet are: 0, 64, 128, 192
```

The same shortcut gives every other boundary:
- /27 → 256 − 224 = **32** → 0, 32, 64, 96, 128, …
- /28 → 256 − 240 = **16** → 0, 16, 32, 48, …
- /29 → 256 − 248 = **8**  → 0, 8, 16, 24, …
- /30 → 256 − 252 = **4**  → 0, 4, 8, 12, …

### 4.3 Allocation walk-through

| Step | Segment | Need | Prefix | Block | Start address | Next free |
|---|---|---:|---|---:|---|---|
| 1 | Sales / POS | 50 | /26 | 64 | 192.168.10.**0** | .64 |
| 2 | Guest Wi-Fi | 28 | /27 | 32 | 192.168.10.**64** | .96 |
| 3 | Admin & Finance | 20 | /27 | 32 | 192.168.10.**96** | .128 |
| 4 | Inventory | 12 | /28 | 16 | 192.168.10.**128** | .144 |
| 5 | Servers | 6 | /29 | 8 | 192.168.10.**144** | .152 |
| 6 | Network management | 2 | /30 | 4 | 192.168.10.**152** | .156 |

Addresses **192.168.10.156 – .255 (100 addresses)** remain unallocated and are reserved for future segments.

---

## 5. IP addressing table (the deliverable)

| VLAN | Segment | Network address | CIDR | Subnet mask | Usable host range | Broadcast | Usable | Gateway |
|---:|---|---|---|---|---|---|---:|---|
| 10 | Sales / POS | 192.168.10.0 | /26 | 255.255.255.192 | 192.168.10.1 – 192.168.10.62 | 192.168.10.63 | 62 | 192.168.10.1 |
| 50 | Guest Wi-Fi | 192.168.10.64 | /27 | 255.255.255.224 | 192.168.10.65 – 192.168.10.94 | 192.168.10.95 | 30 | 192.168.10.65 |
| 20 | Admin & Finance | 192.168.10.96 | /27 | 255.255.255.224 | 192.168.10.97 – 192.168.10.126 | 192.168.10.127 | 30 | 192.168.10.97 |
| 30 | Inventory | 192.168.10.128 | /28 | 255.255.255.240 | 192.168.10.129 – 192.168.10.142 | 192.168.10.143 | 14 | 192.168.10.129 |
| 40 | Servers | 192.168.10.144 | /29 | 255.255.255.248 | 192.168.10.145 – 192.168.10.150 | 192.168.10.151 | 6 | 192.168.10.145 |
| 99 | Management | 192.168.10.152 | /30 | 255.255.255.252 | 192.168.10.153 – 192.168.10.154 | 192.168.10.155 | 2 | 192.168.10.153 |
| — | **Reserved for growth** | 192.168.10.156 | — | — | 192.168.10.156 – 192.168.10.255 | — | 100 | — |

**Convention used:** the first usable address of every subnet is the default gateway (the switched virtual interface on the layer-3 switch).

### 5.1 Efficiency
| | Addresses |
|---|---:|
| Host addresses required | 118 |
| Addresses consumed by VLSM (incl. network + broadcast) | 156 |
| Addresses still free | 100 |
| Utilisation of the /24 | 61% |
| Same design under FLSM (/26 everywhere) | 384 — **does not fit** |

---

## 6. Static address reservations

| Device | Segment | Address | Notes |
|---|---|---|---|
| L3 switch SVI — VLAN 10 | Sales | 192.168.10.1 | Gateway |
| L3 switch SVI — VLAN 50 | Guest | 192.168.10.65 | Gateway |
| L3 switch SVI — VLAN 20 | Admin | 192.168.10.97 | Gateway |
| L3 switch SVI — VLAN 30 | Inventory | 192.168.10.129 | Gateway |
| L3 switch SVI — VLAN 40 | Servers | 192.168.10.145 | Gateway |
| Local DNS / DHCP server | Servers | 192.168.10.146 | |
| Network printer | Servers | 192.168.10.147 | |
| NVR (CCTV) | Servers | 192.168.10.148 | |
| Edge firewall / router — inside | Management | 192.168.10.153 | |
| Managed switch — management IP | Management | 192.168.10.154 | |
| POS terminals 1–8 | Sales | 192.168.10.2 – .9 | Static so receipts can be traced to a till |
| DHCP pool — Sales | Sales | 192.168.10.10 – .62 | |
| DHCP pool — Guest | Guest | 192.168.10.66 – .94 | 4-hour lease |
| DHCP pool — Admin | Admin | 192.168.10.98 – .126 | |
| DHCP pool — Inventory | Inventory | 192.168.10.130 – .142 | |

**WAN link:** the ISP hands over a point-to-point /30 (e.g. 197.210.x.x/30) on the firewall's outside interface, with a public address used for NAT overload (PAT) — every internal host shares one public address on the way out.

---

## 7. Topology

```
                              ┌────────────────────┐
                              │   INTERNET / ISP   │
                              └─────────┬──────────┘
                                        │  /30 point-to-point, public IP
                              ┌─────────▼──────────┐
                              │  EDGE FIREWALL /   │  NAT (PAT)
                              │  ROUTER            │  egress: TCP 443 only
                              │  inside .10.153    │
                              └─────────┬──────────┘
                                        │ trunk (802.1Q)
                              ┌─────────▼──────────┐
                              │  LAYER 3 SWITCH    │  inter-VLAN routing
                              │  SVIs = gateways   │  ACLs between VLANs
                              └──┬───┬───┬───┬───┬─┘
             ┌───────────────────┘   │   │   │   └───────────────┐
             │           ┌───────────┘   │   └──────────┐        │
        ┌────▼─────┐ ┌───▼──────┐  ┌─────▼─────┐  ┌─────▼────┐ ┌─▼────────┐
        │ VLAN 10  │ │ VLAN 20  │  │ VLAN 30   │  │ VLAN 40  │ │ VLAN 50  │
        │ Sales    │ │ Admin    │  │ Inventory │  │ Servers  │ │ Guest    │
        │ /26      │ │ /27      │  │ /28       │  │ /29      │ │ /27      │
        │ 8 POS +  │ │ 20 PCs   │  │ 12 hand-  │  │ DNS/DHCP │ │ AP SSID  │
        │ tablets  │ │          │  │ helds     │  │ print/NVR│ │ isolated │
        └──────────┘ └──────────┘  └───────────┘  └──────────┘ └──────────┘
                                   VLAN 99 Management /30 — switch & firewall mgmt

        ═══════════════════════════════════════════════════════════════════
        Application tier lives OFF-SITE:
            Browser (any VLAN) ──HTTPS 443──▶ Vercel edge (Next.js)
                                          └──▶ Supabase PostgreSQL (TLS)
```

---

## 8. Segmentation policy (why the VLANs exist at all)

| VLAN | May reach | May **not** reach | Reason |
|---|---|---|---|
| 10 Sales | Internet 443, Servers (print) | Admin, Management | Tills are the most exposed devices; they need the app and a printer, nothing else |
| 20 Admin | Internet 443, Servers, Inventory | Management | Finance data segregation |
| 30 Inventory | Internet 443, Servers | Admin, Management | Handhelds are shared devices |
| 40 Servers | Internet 443 (updates) | Guest | Contains the only on-prem data |
| 50 Guest | Internet only | **Every internal VLAN** | Untrusted devices; client isolation on the AP as well |
| 99 Management | All (admin workstation only) | — | Out-of-band administration |

**Egress rule:** outbound is restricted to TCP 443 (and DNS to the internal resolver). Oja needs nothing else. This is the sentence that connects the networking week to the application: *the database is not on this LAN; it is a managed PostgreSQL instance reached over TLS on port 443, so the network's job is segmentation and controlled egress, not hosting.*

---

## 9. Broadcast domains — the underlying reason for all of this

Every subnet is a separate **broadcast domain**. Without segmentation, one flat /24 means every ARP request, every DHCP discover and every Windows discovery broadcast from 118 devices is processed by all 118 devices. Splitting into six subnets:

1. **Shrinks broadcast traffic** — a broadcast in Guest never touches a POS terminal.
2. **Creates a security boundary** — traffic between subnets must cross the layer-3 switch, where an ACL can inspect it.
3. **Localises faults** — a broadcast storm or a misbehaving device affects one department, not the site.
4. **Makes troubleshooting tractable** — an address tells you instantly which department a device is in.

---

## 10. Troubleshooting runbook

| Symptom | Likely cause | Command to prove it |
|---|---|---|
| Device has 169.254.x.x | No DHCP reply — wrong VLAN on the access port, or the relay is missing | `ipconfig /all` · `show vlan brief` |
| Can ping own subnet, not others | Wrong default gateway, or an inter-VLAN ACL is blocking | `ping <gateway>` then `tracert 8.8.8.8` |
| Can ping by IP, not by name | DNS misconfiguration | `nslookup supabase.co` |
| Two devices intermittently drop | Duplicate IP — a static address inside the DHCP pool | `arp -a` on both |
| App loads but data never arrives | Egress 443 blocked, or TLS inspection breaking the connection | browser dev-tools network tab · firewall log |
| Whole subnet offline | Gateway SVI down, or trunk link dropped | `show ip interface brief` |

**Verification commands used during the build:** `ipconfig /all`, `ping`, `tracert`, `arp -a`, `nslookup`, `netstat -an`.

---

## 11. Presenting this in 90 seconds

Say exactly this, pointing at the table:

> "The organisation has a single /24. Six departments need 118 addresses in total, but the biggest needs 50 and the smallest needs 2. Fixed-length subnetting would force every subnet to a /26, which is 384 addresses — more than a /24 contains, so it cannot be done. With VLSM I allocate largest first: Sales gets a /26, Guest and Admin get a /27 each, Inventory a /28, Servers a /29, and the management link a /30. That is 156 addresses used, 100 left for growth, every department in its own broadcast domain and its own VLAN. The application itself is in the cloud, so the firewall only allows outbound 443 — segmentation and controlled egress are what the network contributes to the system."

---

## 12. Practice set (do these cold before the defence)

Work these out without a calculator, then check against §5.

1. Which subnet does **192.168.10.100** belong to? What is its broadcast address and gateway?
2. Is **192.168.10.63** assignable to a workstation? Why or why not?
3. You are asked to add a 10-device CCTV segment. Which block do you use and what is its mask?
4. How many usable hosts does a /29 provide, and how did you get that number?
5. Give the network and broadcast address of **172.16.40.77/20**.
6. How many /28 subnets fit inside a /24?

**Answers:** 1. Admin & Finance, 192.168.10.96/27 — broadcast .127, gateway .97. 2. No — it is the broadcast address of the Sales /26. 3. 10 devices → /28 (14 usable) → 192.168.10.156 is not a /28 boundary, so use **192.168.10.160/28** (range .161–.174, broadcast .175); .156–.159 stays as a spare /30. 4. 2³ − 2 = 6. 5. /20 block size in the third octet is 256 − 240 = 16 → boundaries 32, 48; 40 falls in **172.16.32.0/20**, broadcast **172.16.47.255**. 6. 256 ÷ 16 = **16 subnets**.
