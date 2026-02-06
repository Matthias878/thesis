import os
import math
import torch

def generate_single_pt(
    N=2048,
    tile=256,
    out_path="test_inputs/test_tensor_NxN_4x4.pt",
    tmp_raw_path="test_inputs/_tensor_backing.raw",
    dtype=torch.float16,
    seed=0,
):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    elem_size = torch.tensor([], dtype=dtype).element_size()
    total_elems = N * N * 4 * 4
    total_bytes = total_elems * elem_size

    # Create/truncate backing file
    with open(tmp_raw_path, "wb") as f:
        f.truncate(total_bytes)

    # Memory-map as tensor
    t = torch.from_file(tmp_raw_path, dtype=dtype, size=total_elems).view(N, N, 4, 4)

    g = torch.Generator(device="cpu")
    g.manual_seed(seed)

    num_tiles = math.ceil(N / tile)
    j_full = torch.arange(N, dtype=torch.int32)

    for bi in range(num_tiles):
        i0 = bi * tile
        i1 = min(N, i0 + tile)
        ti = i1 - i0

        i_block = torch.arange(i0, i1, dtype=torch.int32)[:, None]  # (ti,1)

        for bj in range(bi, num_tiles):
            j0 = bj * tile
            j1 = min(N, j0 + tile)
            tj = j1 - j0

            j_block = j_full[j0:j1][None, :]  # (1,tj)

            dist = (i_block - j_block).abs().to(torch.float32)
            decay = (1.0 / (dist + 1.0)).to(dtype)

            x = torch.randn((ti, tj, 4, 4), generator=g, dtype=dtype).abs()
            x.mul_(decay[:, :, None, None])

            t[i0:i1, j0:j1, :, :] = x
            if bj != bi:
                t[j0:j1, i0:i1, :, :] = x.transpose(0, 1)

        print(f"Row tile {bi+1}/{num_tiles} done", flush=True)

    # loop feature
    if N > 100:
        t[20, 100, :, :] += torch.tensor(2.0, dtype=dtype)
        t[100, 20, :, :] += torch.tensor(2.0, dtype=dtype)

    torch.save(t, out_path)
    print(f"\nSaved: {out_path}")

if __name__ == "__main__":
    generate_single_pt(
        N=2048,
        tile=256,
        out_path="test_inputs/test_tensor_NxN_4x4.pt",
        tmp_raw_path="test_inputs/_tensor_backing.raw",
        dtype=torch.float16,
        seed=0,
    )
    print("Done: generated random test input and saved to 'test_inputs/test_tensor_NxN_4x4.pt'")

